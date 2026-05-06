import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AppConfig } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_FILE = join(__dirname, "..", ".env");
const DEFAULT_BASE_URL = "http://10.10.254.52/zentao";
const DEFAULT_HTTP_PORT = 3710;
const DEFAULT_WATCH_INTERVAL_MS = 1800000;

function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (key) result[key] = value;
  }
  return result;
}

function envEscape(value: string): string {
  return value.replace(/\n/g, "\\n");
}

export function normalizeBaseUrl(input = DEFAULT_BASE_URL): string {
  const url = new URL(input);
  let pathname = url.pathname.replace(/\/+$/, "");
  pathname = pathname.replace(/\/(my|user-login)(\/.*|\.html.*)?$/i, "");
  url.pathname = pathname || "/";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
}

export function initConfig(username: string, password: string, baseUrl = DEFAULT_BASE_URL): void {
  if (!username || !password) {
    throw new Error("username and password are required");
  }

  const content = [
    `ZENTAO_BASE_URL=${normalizeBaseUrl(baseUrl)}`,
    `ZENTAO_USERNAME=${envEscape(username)}`,
    `ZENTAO_PASSWORD=${envEscape(password)}`,
    "",
  ].join("\n");

  writeFileSync(ENV_FILE, content, "utf-8");
  chmodSync(ENV_FILE, 0o600);
}

export function initConfigAndReport(username: string, password: string, baseUrl = DEFAULT_BASE_URL): { success: boolean; message: string } {
  initConfig(username, password, baseUrl);
  return { success: true, message: `配置已保存至: ${ENV_FILE}` };
}

export function getConfigStatus(): { configured: boolean; envFile: string; missing: string[]; baseUrl?: string; username?: string } {
  if (!existsSync(ENV_FILE)) {
    return { configured: false, envFile: ENV_FILE, missing: ["ZENTAO_USERNAME", "ZENTAO_PASSWORD"] };
  }

  const env = parseEnvFile(readFileSync(ENV_FILE, "utf-8"));
  const missing = ["ZENTAO_USERNAME", "ZENTAO_PASSWORD"].filter((key) => !env[key]);
  return {
    configured: missing.length === 0,
    envFile: ENV_FILE,
    missing,
    baseUrl: normalizeBaseUrl(env.ZENTAO_BASE_URL || DEFAULT_BASE_URL),
    username: env.ZENTAO_USERNAME,
  };
}

export function loadConfig(): AppConfig {
  if (!existsSync(ENV_FILE)) {
    throw new Error("配置文件不存在，请先初始化账号密码");
  }

  const env = parseEnvFile(readFileSync(ENV_FILE, "utf-8"));
  const baseUrl = env.ZENTAO_BASE_URL || DEFAULT_BASE_URL;
  const username = env.ZENTAO_USERNAME;
  const password = env.ZENTAO_PASSWORD;

  if (!username || !password) {
    throw new Error(".env 缺少 ZENTAO_USERNAME 或 ZENTAO_PASSWORD，请重新初始化");
  }

  return { baseUrl: normalizeBaseUrl(baseUrl), username, password };
}

export interface ServerConfig {
  port: number;
  feishuWebhookUrl?: string;
  feishuKeywordPrefix?: string;
  defaultWatchIntervalMs: number;
  stateDir: string;
  stateFile: string;
}

export function getServerConfig(): ServerConfig {
  const env = existsSync(ENV_FILE) ? parseEnvFile(readFileSync(ENV_FILE, "utf-8")) : {};
  const stateDir = join(__dirname, "..", "data");
  mkdirSync(stateDir, { recursive: true });
  return {
    port: Number(env.HTTP_PORT || DEFAULT_HTTP_PORT),
    feishuWebhookUrl: env.FEISHU_WEBHOOK_URL || undefined,
    feishuKeywordPrefix: env.FEISHU_KEYWORD_PREFIX || undefined,
    defaultWatchIntervalMs: Number(env.BUG_WATCH_INTERVAL_MS || DEFAULT_WATCH_INTERVAL_MS),
    stateDir,
    stateFile: join(stateDir, "watch-state.json"),
  };
}
