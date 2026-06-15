#!/usr/bin/env node

import * as fs from "node:fs";
import * as path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { SpugClient } from "./spug-client.js";
import { sendFeishuNotification } from "./notifier.js";
import type { AppSummary, DeployConfig, Environment, ReleaseRequest, ReleaseStatus, VersionsPayload } from "./types.js";

type Flags = Record<string, string[]>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.resolve(__dirname, "../.env");

function loadEnv() {
  if (!fs.existsSync(ENV_PATH)) return;
  const content = fs.readFileSync(ENV_PATH, "utf-8");
  for (const line of content.split("\n")) {
    const [key, ...valueParts] = line.split("=");
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join("=").trim();
    }
  }
}

function saveEnv(config: Record<string, string>) {
  const currentEnv: Record<string, string> = {};
  if (fs.existsSync(ENV_PATH)) {
    const content = fs.readFileSync(ENV_PATH, "utf-8");
    for (const line of content.split("\n")) {
      const [key, ...valueParts] = line.split("=");
      if (key && valueParts.length > 0) {
        currentEnv[key.trim()] = valueParts.join("=").trim();
      }
    }
  }

  const merged = { ...currentEnv, ...config };
  const lines = Object.entries(merged).map(([key, value]) => `${key}=${value}`);
  fs.writeFileSync(ENV_PATH, lines.join("\n") + "\n");
}

async function main(): Promise<void> {
  loadEnv();
  const [command, ...argv] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help") {
    printHelp();
    return;
  }

  const flags = parseFlags(argv);

  let baseUrl = optionalOne(flags, "base-url") || process.env.SPUG_BASE_URL;
  const username = optionalOne(flags, "username") || process.env.SPUG_USERNAME;
  const password = optionalOne(flags, "password") || process.env.SPUG_PASSWORD;

  const ip = optionalOne(flags, "ip") || process.env.SPUG_IP;
  const port = optionalOne(flags, "port") || process.env.SPUG_PORT;

  const feishuWebhook = optionalOne(flags, "feishu-webhook") || process.env.FEISHU_WEBHOOK;
  const feishuKeyword = optionalOne(flags, "feishu-keyword") || process.env.FEISHU_KEYWORD;

  if (!baseUrl && ip && port) {
    baseUrl = port === "443" ? `https://${ip}` : `http://${ip}:${port}`;
  }

  if (!baseUrl || !username || !password) {
    console.error("Error: Missing configuration. Please provide via flags or .env file.");
    console.error("Required: --base-url (or --ip and --port), --username, --password");
    process.exit(1);
  }

  const json = hasFlag(flags, "json");

  // Save to .env if provided via flags and different from current env
  const newConfig: Record<string, string> = {
    SPUG_USERNAME: username,
    SPUG_PASSWORD: password,
  };
  if (baseUrl) newConfig.SPUG_BASE_URL = baseUrl;
  if (ip) newConfig.SPUG_IP = ip;
  if (port) newConfig.SPUG_PORT = port;
  if (feishuWebhook) newConfig.FEISHU_WEBHOOK = feishuWebhook;
  if (feishuKeyword) newConfig.FEISHU_KEYWORD = feishuKeyword;

  saveEnv(newConfig);

  const client = new SpugClient(baseUrl);
  await client.login({ username, password });

  switch (command) {
    case "login": {
      printResult(json, { ok: true, baseUrl, username });
      return;
    }
    case "list-envs": {
      const environments = await client.getEnvironments();
      printList(json, environments, formatEnvironment);
      return;
    }
    case "list-apps": {
      const apps = await client.getApps();
      printList(json, apps, formatApp);
      return;
    }
    case "list-deploys": {
      const deploys = await client.getDeployConfigs(optionalNumber(flags, "app-id"));
      printList(json, deploys, formatDeploy);
      return;
    }
    case "list-versions": {
      const target = await client.resolveDeployTarget({
        app: optionalOne(flags, "app"),
        env: optionalOne(flags, "env"),
        deployId: optionalNumber(flags, "deploy-id"),
      });
      const versions = await client.getVersions(target.deploy.deploy_id);
      printResult(json, summarizeVersions(target.deploy.deploy_id, versions));
      return;
    }
    case "create-request": {
      const request = await createRequestFromFlags(client, flags);
      printResult(json, request);
      return;
    }
    case "deploy": {
      const requestId = requireNumber(flags, "request-id");
      const result = await client.triggerDeploy(requestId, optionalOne(flags, "mode") ?? "all");
      printResult(json, result);
      return;
    }
    case "status": {
      const requestId = requireNumber(flags, "request-id");
      const status = await client.getReleaseStatus(requestId);
      printResult(json, status);
      return;
    }
    case "deploy-and-watch": {
      const target = await client.resolveDeployTarget({
        app: optionalOne(flags, "app"),
        env: optionalOne(flags, "env"),
        deployId: optionalNumber(flags, "deploy-id"),
      });

      const request = await createRequestFromFlags(client, flags);
      const trigger = await client.triggerDeploy(request.id, optionalOne(flags, "mode") ?? "all");
      const pollSeconds = optionalNumber(flags, "poll-interval") ?? 5;
      const timeoutSeconds = optionalNumber(flags, "timeout") ?? 600;
      const status = await waitForCompletion(client, request.id, pollSeconds, timeoutSeconds);

      printResult(json, {
        request,
        trigger,
        status,
      });

      if (feishuWebhook) {
        const title = `Spug 发布任务: ${request.name}`;
        const content = [
          `应用: ${target.app.name}`,
          `环境: ${target.environment.name}`,
          `状态: ${status.status_alias}`,
          `发布单: ${request.name}`,
          `控制台: ${baseUrl}`,
        ].join("\n");
        await sendFeishuNotification({ webhook: feishuWebhook, keyword: feishuKeyword }, title, content);
      }

      if (!isSuccessStatus(status.status)) {
        process.exitCode = 1;
      }
      return;
    }
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

async function createRequestFromFlags(client: SpugClient, flags: Flags): Promise<ReleaseRequest> {
  const target = await client.resolveDeployTarget({
    app: optionalOne(flags, "app"),
    env: optionalOne(flags, "env"),
    deployId: optionalNumber(flags, "deploy-id"),
  });

  const name = optionalOne(flags, "name") ?? defaultRequestName(target.deploy.deploy_id);
  const hostIds = parseNumberList(flags, "host-id", "host-ids");
  const extra = parseExtra(flags);

  return client.createReleaseRequest({
    deployId: target.deploy.deploy_id,
    name,
    hostIds: hostIds.length > 0 ? hostIds : target.deploy.host_ids,
    extra,
  });
}

async function waitForCompletion(
  client: SpugClient,
  requestId: number,
  pollSeconds: number,
  timeoutSeconds: number,
) {
  const startedAt = Date.now();
  while (true) {
    const status = await client.getReleaseStatus(requestId);
    if (!isPendingStatus(status.status)) {
      return status;
    }

    const elapsed = Date.now() - startedAt;
    if (elapsed >= timeoutSeconds * 1000) {
      throw new Error(`Timed out waiting for request ${requestId} after ${timeoutSeconds}s.`);
    }

    await sleep(pollSeconds * 1000);
  }
}

function summarizeVersions(deployId: number, versions: VersionsPayload) {
  const branches = Object.entries(versions.branches ?? {}).map(([name, commits]) => ({
    name,
    count: commits.length,
    latest: commits[0] ?? null,
  }));

  const tags = Object.entries(versions.tags ?? {}).map(([name, commit]) => ({
    name,
    commit,
  }));

  return { deployId, branches, tags };
}

function defaultRequestName(deployId: number): string {
  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  return `spug-cli-${deployId}-${timestamp}`;
}

function parseExtra(flags: Flags): [string, string, string] | null {
  const versionKind = optionalOne(flags, "version-kind");
  const versionName = optionalOne(flags, "version-name");
  const versionValue = optionalOne(flags, "version-value");
  if (versionKind || versionName || versionValue) {
    if (!versionKind || !versionName || !versionValue) {
      throw new Error("--version-kind, --version-name and --version-value must be provided together.");
    }
    return [versionKind, versionName, versionValue];
  }

  const branch = optionalOne(flags, "branch");
  const commit = optionalOne(flags, "commit");
  if (branch || commit) {
    if (!branch || !commit) {
      throw new Error("--branch and --commit must be provided together.");
    }
    return ["branch", branch, commit];
  }

  const tag = optionalOne(flags, "tag");
  if (tag || commit) {
    if (!tag || !commit) {
      throw new Error("--tag and --commit must be provided together.");
    }
    return ["tag", tag, commit];
  }

  return null;
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const withoutPrefix = token.slice(2);
    const [name, inlineValue] = withoutPrefix.split("=", 2);
    if (inlineValue !== undefined) {
      pushFlag(flags, name, inlineValue);
      continue;
    }

    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      pushFlag(flags, name, "true");
      continue;
    }

    pushFlag(flags, name, next);
    index += 1;
  }

  return flags;
}

function pushFlag(flags: Flags, name: string, value: string): void {
  const bucket = flags[name] ?? [];
  bucket.push(value);
  flags[name] = bucket;
}

function hasFlag(flags: Flags, name: string): boolean {
  return name in flags;
}

function optionalOne(flags: Flags, name: string): string | undefined {
  const values = flags[name];
  if (!values || values.length === 0) {
    return undefined;
  }
  return values[values.length - 1];
}

function requireOne(flags: Flags, name: string): string {
  const value = optionalOne(flags, name);
  if (!value) {
    throw new Error(`Missing required flag --${name}`);
  }
  return value;
}

function optionalNumber(flags: Flags, name: string): number | undefined {
  const raw = optionalOne(flags, name);
  if (!raw) {
    return undefined;
  }
  return parseInteger(raw, name);
}

function requireNumber(flags: Flags, name: string): number {
  const raw = requireOne(flags, name);
  return parseInteger(raw, name);
}

function parseInteger(raw: string, name: string): number {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed)) {
    throw new Error(`Flag --${name} must be an integer, received: ${raw}`);
  }
  return parsed;
}

function parseNumberList(flags: Flags, singular: string, plural: string): number[] {
  const values = [...(flags[singular] ?? []), ...(flags[plural] ?? [])];
  return values
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => parseInteger(value, plural));
}

function isPendingStatus(status: string): boolean {
  return status === "1" || status === "2";
}

function isSuccessStatus(status: string): boolean {
  return status === "3";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printResult(json: boolean, value: unknown): void {
  if (json) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }

  if (typeof value === "string") {
    console.log(value);
    return;
  }

  console.log(JSON.stringify(value, null, 2));
}

function printList<T>(json: boolean, items: T[], formatter: (item: T) => string): void {
  if (json) {
    printResult(true, items);
    return;
  }

  for (const item of items) {
    console.log(formatter(item));
  }
}

function formatEnvironment(environment: Environment): string {
  return `${environment.id}\t${environment.key}\t${environment.name}`;
}

function formatApp(app: AppSummary): string {
  return `${app.id}\t${app.key}\t${app.name}`;
}

function formatDeploy(deploy: DeployConfig): string {
  return `${deploy.deploy_id}\tapp=${deploy.app_name}\tenv=${deploy.env_id}\thosts=${deploy.host_ids.join(",")}\taudit=${deploy.is_audit}`;
}

function printHelp(): void {
  console.log(`spug-skill

Usage:
  npx tsx src/cli.ts <command> [flags]

Configuration flags (stored in .env after first use):
  --base-url <url>      Spug base URL (e.g. http://localhost:8000)
  --ip <ip>             Spug server IP
  --port <port>         Spug server port (default 80, 443 uses https)
  --username <user>     Spug login username
  --password <password> Spug login password
  --feishu-webhook <url> Feishu notification webhook URL
  --feishu-keyword <text> Feishu notification security keyword

Commands:
  login
  list-envs
  list-apps
  list-deploys [--app-id <id>]
  list-versions (--deploy-id <id> | --app <name> --env <name>)
  create-request (--deploy-id <id> | --app <name> --env <name>) [--name <text>] [--host-ids 1,2] [--branch <name> --commit <sha>]
  deploy --request-id <id> [--mode all]
  status --request-id <id>
  deploy-and-watch (--deploy-id <id> | --app <name> --env <name>) [--name <text>] [--host-ids 1,2] [--branch <name> --commit <sha>] [--poll-interval 5] [--timeout 600]

Version flags:
  --branch <name> --commit <sha>
  --tag <name> --commit <sha>
  --version-kind <kind> --version-name <name> --version-value <value>

Output:
  Add --json for structured output.
`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
