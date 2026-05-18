import { stripTags } from "../html.js";
import type { BugSummary } from "../types.js";
import type { ZentaoClient } from "../client.js";

function absoluteLink(client: ZentaoClient, href: string): string {
  return client.resolve(href);
}

function parseBugRows(client: ZentaoClient, html: string): BugSummary[] {
  const bugs = new Map<number, BugSummary>();
  const rowPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  for (const rowMatch of html.matchAll(rowPattern)) {
    const row = rowMatch[1];
    const linkMatch = row.match(/<a\b[^>]*href=["']([^"']*bug-(?:view|edit)-(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;
    const id = Number(linkMatch[2]);
    const title = stripTags(linkMatch[3]) || `Bug #${id}`;
    const rawText = stripTags(row);
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => stripTags(cell[1]));
    bugs.set(id, {
      id,
      title,
      link: absoluteLink(client, linkMatch[1]),
      severity: cells.find((cell) => /^S?\d$/.test(cell)),
      priority: cells.find((cell) => /^P?\d$/.test(cell)),
      status: cells.find((cell) => /^(active|resolved|closed|激活|已解决|已关闭)$/i.test(cell)),
      rawText,
    });
  }

  if (bugs.size > 0) return [...bugs.values()];

  for (const linkMatch of html.matchAll(/<a\b[^>]*href=["']([^"']*bug-view-(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const id = Number(linkMatch[2]);
    if (bugs.has(id)) continue;
    bugs.set(id, {
      id,
      title: stripTags(linkMatch[3]) || `Bug #${id}`,
      link: absoluteLink(client, linkMatch[1]),
      rawText: stripTags(linkMatch[0]),
    });
  }

  return [...bugs.values()];
}

export interface ListMyBugsResult {
  success: boolean;
  source: string;
  count: number;
  bugs: BugSummary[];
}

export async function listMyBugs(client: ZentaoClient): Promise<ListMyBugsResult> {
  const loginResult = await client.login();
  if (!loginResult.success && loginResult.message === "未找到登录表单") {
    // 已经登录过，或者页面异常。我们继续。
  } else if (!loginResult.success) {
    throw new Error(`登录禅道失败: ${loginResult.message}`);
  }

  const sources = ["my-bug.html", "index.php?m=my&f=bug", "my/"];
  for (const source of sources) {
    const html = await client.text(source);

    // 检查是否被重定向到了登录页
    if (html.includes("user-login.html") || html.includes("account") && html.includes("password") && html.includes("<form")) {
      throw new Error("禅道会话已过期或重定向至登录页");
    }

    const bugs = parseBugRows(client, html);
    // 如果找到了 bug，或者这是最后一个尝试的源且 HTML 看起来像是一个合法的禅道页面
    const isZentaoPage = html.includes("zentao") || html.includes("z-") || html.includes("bug");
    if (bugs.length > 0 || (source === sources[sources.length - 1] && isZentaoPage)) {
      return { success: true, source, count: bugs.length, bugs };
    }
  }
  throw new Error("无法从禅道获取 Bug 列表，页面解析失败或会话异常");
}
