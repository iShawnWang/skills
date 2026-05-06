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
  await client.login();
  const sources = ["my-bug.html", "index.php?m=my&f=bug", "my/"];
  for (const source of sources) {
    const html = await client.text(source);
    const bugs = parseBugRows(client, html);
    if (bugs.length > 0 || source === sources[sources.length - 1]) {
      return { success: true, source, count: bugs.length, bugs };
    }
  }
  return { success: true, source: sources[sources.length - 1], count: 0, bugs: [] };
}
