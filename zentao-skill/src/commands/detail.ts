import type { ZentaoClient } from "../client.js";
import { getAttribute, stripTags } from "../html.js";

interface AttachmentSummary {
  name: string;
  href: string;
  media: boolean;
}

export interface BugDetailResult {
  success: boolean;
  id: number;
  url: string;
  title: string;
  steps: string;
  fields: Record<string, string>;
  histories: Array<{ index: number; summary: string; comment?: string }>;
  attachments: AttachmentSummary[];
  mediaAttachmentsIgnored: number;
}

function firstMatch(html: string, pattern: RegExp): string {
  const match = html.match(pattern);
  return match ? stripTags(match[1]) : "";
}

function parsePageTitle(html: string): string {
  return firstMatch(html, /<span[^>]*class=['"][^'"]*label-id[^'"]*['"][^>]*>[\s\S]*?<\/span>\s*<span[^>]*title=['"]([^'"]+)['"]/i)
    || firstMatch(html, /<title[^>]*>BUG\s*#\d+\s*([\s\S]*?)\s*-\s*禅道<\/title>/i)
    || firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
}

function parseDetailContent(html: string, title: string): string {
  const pattern = new RegExp(`<div[^>]*class=["'][^"']*detail-title[^"']*["'][^>]*>\\s*${title}\\s*<\\/div>\\s*<div[^>]*class=["'][^"']*detail-content[^"']*["'][^>]*>([\\s\\S]*?)<\\/div>`, "i");
  return firstMatch(html, pattern);
}

function parseTables(html: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const th = row[1].match(/<th\b[^>]*>([\s\S]*?)<\/th>/i);
    const td = row[1].match(/<td\b[^>]*>([\s\S]*?)<\/td>/i);
    if (!th || !td) continue;
    const key = stripTags(th[1]);
    let value = stripTags(td[1]);
    if (!value) {
      value = td[1].match(/\bdata-severity=['"]([^'"]+)['"]/i)?.[1]
        ?? td[1].match(/\btitle=['"]([^'"]+)['"]/i)?.[1]
        ?? "";
    }
    if (key) result[key] = value;
  }
  return result;
}

function parseHistories(html: string): Array<{ index: number; summary: string; comment?: string }> {
  const histories = html.match(/<ol[^>]*class=['"][^'"]*histories-list[^'"]*['"][^>]*>([\s\S]*?)<\/ol>/i)?.[1] ?? "";
  const items: Array<{ index: number; summary: string; comment?: string }> = [];
  for (const match of histories.matchAll(/<li\b([^>]*)>([\s\S]*?)(?=<li\b|$)/gi)) {
    const index = Number(getAttribute(match[1], "value") ?? items.length + 1);
    const body = match[2];
    const comment = firstMatch(body, /<div[^>]*class=['"][^'"]*comment-content[^'"]*['"][^>]*>([\s\S]*?)<\/div>/i);
    const withoutForms = body.replace(/<form[\s\S]*?<\/form>/gi, " ");
    const summary = stripTags(withoutForms).replace(comment, "").trim();
    items.push({ index, summary, ...(comment ? { comment } : {}) });
  }
  return items;
}

function parseAttachments(client: ZentaoClient, html: string): AttachmentSummary[] {
  const attachments: AttachmentSummary[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = getAttribute(match[1], "href");
    if (!href || !/(file-|\/data\/upload|download|attachment)/i.test(href)) continue;
    const name = stripTags(match[2]) || href.split("/").pop() || href;
    const media = /\.(png|jpe?g|gif|webp|bmp|svg|mp4|mov|avi|mkv|webm)$/i.test(name) || /\.(png|jpe?g|gif|webp|bmp|svg|mp4|mov|avi|mkv|webm)(\?|$)/i.test(href);
    const resolved = client.resolve(href);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    attachments.push({ name, href: resolved, media });
  }
  return attachments;
}

export async function getBugDetail(client: ZentaoClient, bugId: string | undefined, includeMedia = false): Promise<BugDetailResult> {
  if (!bugId) {
    throw new Error("bugId is required");
  }

  await client.login();
  const path = `bug-view-${bugId}.html`;
  const response = await client.request(path);
  const html = await response.text();
  const fields = parseTables(html);
  const attachments = parseAttachments(client, html);
  const visibleAttachments = includeMedia ? attachments : attachments.filter((item) => !item.media);

  return {
    success: response.ok,
    id: Number(bugId),
    url: client.resolve(path),
    title: parsePageTitle(html),
    steps: parseDetailContent(html, "重现步骤"),
    fields,
    histories: parseHistories(html),
    attachments: visibleAttachments,
    mediaAttachmentsIgnored: includeMedia ? 0 : attachments.length - visibleAttachments.length,
  };
}
