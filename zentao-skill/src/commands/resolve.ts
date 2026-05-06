import type { ZentaoClient } from "../client.js";
import { extractForms } from "../html.js";

function isDenied(text: string): boolean {
  return /user-deny|没有权限|无权访问/i.test(text);
}

function extractKuid(html: string): string | undefined {
  return html.match(/kuid\s*=\s*['"]([^'"]+)/)?.[1];
}

function headers(client: ZentaoClient, resolvePath: string): Record<string, string> {
  return {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "origin": new URL(client.baseUrl).origin,
    "referer": client.resolve(resolvePath),
  };
}

function toMultipart(fields: Record<string, string>): FormData {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (key === "files[]") continue;
    body.append(key, value);
  }
  return body;
}

function parseOptions(args: string[]): {
  build?: string;
  assignedTo?: string;
  dryRun: boolean;
  rest: string[];
} {
  const build = args.find((arg) => arg.startsWith("--build="))?.slice("--build=".length);
  const assignedTo = args.find((arg) => arg.startsWith("--assigned-to="))?.slice("--assigned-to=".length);
  return {
    build,
    assignedTo,
    dryRun: args.includes("--dry-run"),
    rest: args.filter((arg) => !arg.startsWith("--build=") && !arg.startsWith("--assigned-to=") && arg !== "--dry-run"),
  };
}

export async function resolveBug(client: ZentaoClient, bugId: string | undefined, resolutionArg: string | undefined, args: string[]) {
  if (!bugId) {
    throw new Error("bugId is required");
  }

  const { build, assignedTo, dryRun, rest } = parseOptions(args);
  const resolution = resolutionArg && !resolutionArg.startsWith("--") ? resolutionArg : "fixed";
  const commentParts = resolutionArg && resolutionArg.startsWith("--") ? [resolutionArg, ...rest] : rest;
  const filteredCommentParts = commentParts.filter((arg) => !arg.startsWith("--build=") && !arg.startsWith("--assigned-to=") && arg !== "--dry-run");
  const comment = filteredCommentParts.join(" ");

  await client.login();
  const resolvePath = `bug-resolve-${bugId}.html?onlybody=yes`;
  const html = await client.text(resolvePath);
  const form = extractForms(html)[0];
  if (!form || !("resolution" in form.fields)) {
    return {
      success: false,
      bugId: Number(bugId),
      resolution,
      message: "未找到解决 Bug 表单，请运行 diagnose bug 查看实际操作链接",
    };
  }

  const fields: Record<string, string> = {
    ...form.fields,
    resolution,
    status: "resolved",
    comment,
  };
  if (build !== undefined) fields.resolvedBuild = build;
  else if (!fields.resolvedBuild) fields.resolvedBuild = "trunk";
  if (assignedTo !== undefined) fields.assignedTo = assignedTo;

  const kuid = extractKuid(html);
  if (kuid) fields.uid = kuid;

  if (dryRun) {
    return {
      success: true,
      dryRun: true,
      bugId: Number(bugId),
      fields,
      message: "已解析解决表单，未提交",
    };
  }

  const response = await client.request(form.action || resolvePath, {
    method: "POST",
    headers: headers(client, resolvePath),
    body: toMultipart(fields),
  });
  const text = await response.text();
  const success = response.ok && !isDenied(text);

  return {
    success,
    status: response.status,
    bugId: Number(bugId),
    resolution,
    resolvedBuild: fields.resolvedBuild,
    assignedTo: fields.assignedTo,
    message: success ? "Bug 解决已提交" : "Bug 解决失败",
    preview: text.slice(0, 300),
  };
}
