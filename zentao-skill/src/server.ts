import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { getConfigStatus, getServerConfig, loadConfig, type ServerConfig } from "./config.js";
import { ZentaoClient } from "./client.js";
import { listMyBugs } from "./commands/bugs.js";
import { getBugDetail } from "./commands/detail.js";
import { commentBug } from "./commands/comment.js";
import { assignBug } from "./commands/assign.js";
import { resolveBug } from "./commands/resolve.js";
import { closeBug } from "./commands/close.js";
import { diagnose } from "./commands/diagnose.js";

interface RequestBody {
  username?: string;
  password?: string;
  baseUrl?: string;
  bugId?: number | string;
  includeMedia?: boolean;
  comment?: string;
  assignedTo?: string;
  resolution?: string;
  args?: string[];
  target?: string;
  watchKey?: string;
  assignee?: string;
  intervalMs?: number;
  mailto?: string[];
  build?: string;
  resetAll?: boolean;
  dryRun?: boolean;
}

interface WatchState {
  snapshotBugIds: number[];
  lastCheckedAt: string;
  assignee: string;
}

type WatchStateStore = Record<string, WatchState>;

interface WatchRuntime {
  timer: ReturnType<typeof setInterval>;
  intervalMs: number;
  assignee: string;
}

function json(res: ServerResponse, statusCode: number, payload: Record<string, unknown>): void {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload, null, 2));
}

function ok(res: ServerResponse, data: unknown): void {
  json(res, 200, { success: true, data });
}

function fail(res: ServerResponse, statusCode: number, code: string, message: string): void {
  json(res, statusCode, { success: false, error: { code, message } });
}

async function readJsonBody(req: IncomingMessage): Promise<RequestBody> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  const raw = Buffer.concat(chunks).toString("utf-8").trim();
  if (!raw) return {};
  return JSON.parse(raw) as RequestBody;
}

function loadWatchState(config: ServerConfig): WatchStateStore {
  if (!existsSync(config.stateFile)) return {};
  try {
    return JSON.parse(readFileSync(config.stateFile, "utf-8")) as WatchStateStore;
  } catch {
    return {};
  }
}

function saveWatchState(config: ServerConfig, state: WatchStateStore): void {
  writeFileSync(config.stateFile, JSON.stringify(state, null, 2), "utf-8");
}

async function notifyFeishu(
  webhookUrl: string | undefined,
  keywordPrefix: string | undefined,
  bugs: Awaited<ReturnType<typeof listMyBugs>>["bugs"],
  assignee: string,
): Promise<void> {
  if (!webhookUrl || bugs.length === 0) return;
  const lines = bugs.flatMap((bug) => [
    `禅道Bug编号：#${bug.id}`,
    `标题：${bug.title}`,
    `严重程度：${bug.severity ?? "-"}`,
    `优先级：${bug.priority ?? "-"}`,
    `状态：${bug.status ?? "-"}`,
    `Bug链接：${bug.link}`,
    "",
  ]);
  const header = `${keywordPrefix ? `${keywordPrefix} ` : ""}禅道新 Bug 指派给 ${assignee}`.trim();
  const content = [header, ...lines].join("\n").trim();
  await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ msg_type: "text", content: { text: content } }),
  });
}

class WatchManager {
  private readonly runtime = new Map<string, WatchRuntime>();
  private state: WatchStateStore;

  constructor(private readonly config: ServerConfig) {
    this.state = loadWatchState(config);
  }

  status(): Record<string, unknown> {
    return {
      watchers: [...this.runtime.entries()].map(([watchKey, item]) => ({
        watchKey,
        assignee: item.assignee,
        intervalMs: item.intervalMs,
        snapshotBugIds: this.state[watchKey]?.snapshotBugIds ?? [],
        lastCheckedAt: this.state[watchKey]?.lastCheckedAt ?? null,
        running: true,
      })),
    };
  }

  async start(watchKey: string, assignee: string, intervalMs: number): Promise<Record<string, unknown>> {
    if (!this.config.feishuWebhookUrl) throw new Error("FEISHU_WEBHOOK_URL is required before starting watcher");
    await this.stop(watchKey);
    if (!this.state[watchKey]) {
      const client = new ZentaoClient(loadConfig());
      const initial = await listMyBugs(client);
      this.state[watchKey] = {
        assignee,
        snapshotBugIds: initial.bugs.map((bug) => bug.id),
        lastCheckedAt: new Date().toISOString(),
      };
      saveWatchState(this.config, this.state);
    }

    const tick = async (): Promise<void> => {
      const client = new ZentaoClient(loadConfig());
      const result = await listMyBugs(client);
      const currentIds = result.bugs.map((bug) => bug.id);
      const previousIds = new Set(this.state[watchKey]?.snapshotBugIds ?? []);
      const newBugs = result.bugs.filter((bug) => !previousIds.has(bug.id));
      await notifyFeishu(this.config.feishuWebhookUrl, this.config.feishuKeywordPrefix, newBugs, assignee);
      this.state[watchKey] = {
        assignee,
        snapshotBugIds: currentIds,
        lastCheckedAt: new Date().toISOString(),
      };
      saveWatchState(this.config, this.state);
    };

    const timer = setInterval(() => {
      void tick().catch((error) => {
        const previous = this.state[watchKey];
        this.state[watchKey] = {
          assignee,
          snapshotBugIds: previous?.snapshotBugIds ?? [],
          lastCheckedAt: new Date().toISOString(),
        };
        saveWatchState(this.config, this.state);
        console.error(`[watch:${watchKey}]`, error);
      });
    }, intervalMs);

    this.runtime.set(watchKey, { timer, intervalMs, assignee });
    return {
      watchKey,
      assignee,
      intervalMs,
      snapshotBugIds: this.state[watchKey].snapshotBugIds,
      lastCheckedAt: this.state[watchKey].lastCheckedAt,
      message: "watcher 已启动；首次启动仅建立快照，不通知历史 bug",
    };
  }

  async stop(watchKey: string): Promise<Record<string, unknown>> {
    const runtime = this.runtime.get(watchKey);
    if (runtime) {
      clearInterval(runtime.timer);
      this.runtime.delete(watchKey);
    }
    return { watchKey, stopped: true };
  }

  async reset(watchKey?: string, resetAll = false): Promise<Record<string, unknown>> {
    if (resetAll) {
      this.state = {};
      saveWatchState(this.config, this.state);
      return { resetAll: true };
    }
    if (!watchKey) throw new Error("watchKey is required");
    delete this.state[watchKey];
    saveWatchState(this.config, this.state);
    return { watchKey, reset: true };
  }
}

function requireBugId(body: RequestBody): string {
  if (body.bugId === undefined || body.bugId === null || body.bugId === "") throw new Error("bugId is required");
  return String(body.bugId);
}

async function callTool(pathname: string, body: RequestBody, watchManager: WatchManager): Promise<unknown> {
  switch (pathname) {
    case "/status":
      return getConfigStatus();
    case "/login": {
      const client = new ZentaoClient(loadConfig());
      return { ...(await client.login()), baseUrl: client.baseUrl };
    }
    case "/list_my_bugs": {
      const client = new ZentaoClient(loadConfig());
      return listMyBugs(client);
    }
    case "/bug_detail": {
      const client = new ZentaoClient(loadConfig());
      return getBugDetail(client, requireBugId(body), Boolean(body.includeMedia));
    }
    case "/comment_bug": {
      const client = new ZentaoClient(loadConfig());
      return commentBug(client, requireBugId(body), String(body.comment ?? ""));
    }
    case "/assign_bug": {
      const client = new ZentaoClient(loadConfig());
      const args: string[] = [];
      if (Array.isArray(body.mailto) && body.mailto.length > 0) args.push(`--mailto=${body.mailto.join(",")}`);
      if (body.comment) args.push(String(body.comment));
      if (body.dryRun) args.push("--dry-run");
      return assignBug(client, requireBugId(body), String(body.assignedTo ?? ""), args);
    }
    case "/resolve_bug": {
      const client = new ZentaoClient(loadConfig());
      const args: string[] = [];
      if (body.build) args.push(`--build=${body.build}`);
      if (body.assignedTo) args.push(`--assigned-to=${body.assignedTo}`);
      if (body.comment) args.push(String(body.comment));
      if (body.dryRun) args.push("--dry-run");
      return resolveBug(client, requireBugId(body), body.resolution ? String(body.resolution) : undefined, args);
    }
    case "/close_bug": {
      const client = new ZentaoClient(loadConfig());
      return closeBug(client, requireBugId(body), body.resolution ? String(body.resolution) : "fixed", body.comment ? String(body.comment) : "");
    }
    case "/diagnose": {
      const client = new ZentaoClient(loadConfig());
      return diagnose(client, body.target ? String(body.target) : "my", body.bugId !== undefined ? String(body.bugId) : undefined);
    }
    case "/watch/start": {
      const config = loadConfig();
      const assignee = body.assignee ? String(body.assignee) : config.username;
      const watchKey = body.watchKey ? String(body.watchKey) : `my-bugs:${assignee}`;
      const intervalMs = Number(body.intervalMs || getServerConfig().defaultWatchIntervalMs);
      return watchManager.start(watchKey, assignee, intervalMs);
    }
    case "/watch/stop":
      return watchManager.stop(String(body.watchKey ?? ""));
    case "/watch/status":
      return watchManager.status();
    case "/watch/reset":
      return watchManager.reset(body.watchKey ? String(body.watchKey) : undefined, Boolean(body.resetAll));
    default:
      throw new Error(`unknown route: ${pathname}`);
  }
}

export function startServer(options?: { silent?: boolean }): { listen(port: number, host: string, callback?: () => void): void; close(callback?: () => void): void } {
  const serverConfig = getServerConfig();
  const watchManager = new WatchManager(serverConfig);

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
      if (req.method === "GET" && (url.pathname === "/health" || url.pathname === '/')) {
        ok(res, { ok: true });
        return;
      }
      if (req.method !== "POST") {
        fail(res, 405, "METHOD_NOT_ALLOWED", "only POST is supported");
        return;
      }

      const body = await readJsonBody(req);
      const result = await callTool(url.pathname, body, watchManager);
      ok(res, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const statusCode = /required|配置文件|缺少|初始化/.test(message) ? 400 : 500;
      fail(res, statusCode, "REQUEST_FAILED", message);
    }
  });

  server.listen(serverConfig.port, "127.0.0.1", () => {
    if (!options?.silent) {
      console.log(JSON.stringify({
        success: true,
        message: "zentao http server listening",
        port: serverConfig.port,
        health: `http://127.0.0.1:${serverConfig.port}/health`,
      }));
    }
  });
  return server;
}
