import type { ZentaoClient } from "../client.js";
import { extractForms } from "../html.js";

function isDenied(text: string): boolean {
  return /user-deny|没有权限|无权访问/i.test(text);
}

function extractKuid(html: string): string | undefined {
  return html.match(/kuid\s*=\s*['"]([^'"]+)/)?.[1];
}

function headers(client: ZentaoClient, assignPath: string): Record<string, string> {
  return {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "content-type": "application/x-www-form-urlencoded",
    "origin": new URL(client.baseUrl).origin,
    "referer": client.resolve(assignPath),
  };
}

function parseOptions(args: string[]): { mailto: string[]; dryRun: boolean; rest: string[] } {
  const mailtoArg = args.find((arg) => arg.startsWith("--mailto="));
  const mailto = mailtoArg?.slice("--mailto=".length).split(",").map((item) => item.trim()).filter(Boolean) ?? [];
  return {
    mailto,
    dryRun: args.includes("--dry-run"),
    rest: args.filter((arg) => !arg.startsWith("--mailto=") && arg !== "--dry-run"),
  };
}

export async function assignBug(client: ZentaoClient, bugId: string | undefined, assignedTo: string | undefined, args: string[]): Promise<void> {
  if (!bugId || !assignedTo) {
    console.error("用法: assign <bugId> <assignedTo> [comment] [--mailto=user1,user2] [--dry-run]");
    process.exit(1);
  }

  const { mailto, dryRun, rest } = parseOptions(args);
  const comment = rest.join(" ");
  await client.login();

  const assignPath = `bug-assignTo-${bugId}.html?onlybody=yes`;
  const html = await client.text(assignPath);
  const form = extractForms(html)[0];
  if (!form || !("assignedTo" in form.fields)) {
    console.log(JSON.stringify({
      success: false,
      bugId: Number(bugId),
      assignedTo,
      message: "未找到指派表单，请运行 diagnose bug 查看实际操作链接",
    }, null, 2));
    return;
  }

  const fields: Record<string, string> = {
    ...form.fields,
    assignedTo,
    status: form.fields.status || "active",
    comment,
  };
  const kuid = extractKuid(html);
  if (kuid) fields.uid = kuid;

  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) body.append(key, value);
  if (mailto.length > 0) {
    body.delete("mailto[]");
    for (const account of mailto) body.append("mailto[]", account);
  }

  if (dryRun) {
    console.log(JSON.stringify({
      success: true,
      dryRun: true,
      bugId: Number(bugId),
      assignedTo,
      mailto,
      fields: Object.fromEntries(body.entries()),
      message: "已解析指派表单，未提交",
    }, null, 2));
    return;
  }

  const response = await client.request(form.action || assignPath, {
    method: "POST",
    headers: headers(client, assignPath),
    body,
  });
  const text = await response.text();
  const success = response.ok && !isDenied(text);

  console.log(JSON.stringify({
    success,
    status: response.status,
    bugId: Number(bugId),
    assignedTo,
    mailto,
    message: success ? "Bug 指派已提交" : "Bug 指派失败",
    preview: text.slice(0, 300),
  }, null, 2));
}
