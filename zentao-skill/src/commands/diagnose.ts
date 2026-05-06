import { extractTitle, summarizeForms } from "../html.js";
import type { ZentaoClient } from "../client.js";

function bugLinks(html: string): Array<{ id: number; href: string; text: string }> {
  return [...html.matchAll(/<a\b[^>]*href=["']([^"']*bug-view-(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .slice(0, 20)
    .map((match) => ({
      id: Number(match[2]),
      href: match[1],
      text: match[3].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    }));
}

function actionLinks(html: string): Array<{ href: string; text: string }> {
  return [...html.matchAll(/<a\b[^>]*href=["']([^"']*(?:comment|close|resolve|activate|edit|assignTo)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .slice(0, 40)
    .map((match) => ({
      href: match[1],
      text: match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    }));
}

export async function diagnose(client: ZentaoClient, target = "my", bugId?: string): Promise<Record<string, unknown>> {
  let path = "my/";
  if (target === "login") path = "user-login.html";
  if (target === "bug") {
    if (!bugId) {
      throw new Error("bugId is required when target=bug");
    }
    await client.login();
    path = `bug-view-${bugId}.html`;
  } else if (target !== "login") {
    await client.login();
  }

  const response = await client.request(path);
  const responseHtml = await response.text();
  return {
    success: true,
    path,
    url: client.resolve(path),
    status: response.status,
    title: extractTitle(responseHtml),
    forms: summarizeForms(responseHtml),
    bugLinks: bugLinks(responseHtml),
    actionLinks: actionLinks(responseHtml),
  };
}
