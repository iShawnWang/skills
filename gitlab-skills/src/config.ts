import { readFileSync, writeFileSync, chmodSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AppConfig } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_FILE = join(__dirname, "..", ".env.gitlab");

/**
 * 解析 .env 文件内容为键值对
 */
function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    // 跳过空行和注释
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (key) result[key] = value;
  }
  return result;
}

/**
 * 初始化配置：将 token 和 endpoint 写入 .env.gitlab
 */
export function initConfig(token: string, endpoint: string): void {
  if (!token || !endpoint) {
    console.error("用法: init <accessToken> <gitlabEndpoint>");
    process.exit(1);
  }

  const content = `GITLAB_ACCESS_TOKEN=${token}\nGITLAB_ENDPOINT=${endpoint}\n`;
  writeFileSync(ENV_FILE, content, "utf-8");
  chmodSync(ENV_FILE, 0o600);

  console.log(JSON.stringify({ success: true, message: `配置已初始化并安全保存至: ${ENV_FILE}` }));
}

/**
 * 加载配置：从 .env.gitlab 读取并校验
 */
export function loadConfig(): AppConfig {
  let content: string;
  try {
    content = readFileSync(ENV_FILE, "utf-8");
  } catch {
    console.error("错误: 配置文件不存在，请先执行 'npx tsx src/index.ts init <token> <endpoint>' 进行初始化");
    process.exit(1);
  }

  const env = parseEnvFile(content);
  const accessToken = env["GITLAB_ACCESS_TOKEN"];
  const endpoint = env["GITLAB_ENDPOINT"];

  if (!accessToken || !endpoint) {
    console.error("错误: 配置文件缺少 GITLAB_ACCESS_TOKEN 或 GITLAB_ENDPOINT，请重新初始化");
    process.exit(1);
  }

  return { accessToken, endpoint };
}
