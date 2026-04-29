import type { ZentaoClient } from "../client.js";
import { extractForms } from "../html.js";

function isDenied(text: string): boolean {
  return /user-deny|没有权限|无权访问/i.test(text);
}

function ajaxHeaders(client: ZentaoClient): Record<string, string> {
  return {
    "accept": "application/json, text/javascript, */*; q=0.01",
    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    "origin": new URL(client.baseUrl).origin,
    "x-requested-with": "XMLHttpRequest",
  };
}

function editHeaders(client: ZentaoClient, editPath: string): Record<string, string> {
  return {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "origin": new URL(client.baseUrl).origin,
    "referer": client.resolve(editPath),
  };
}

function extractKuid(html: string): string | undefined {
  return html.match(/kuid\s*=\s*['"]([^'"]+)/)?.[1];
}

function toMultipart(fields: Record<string, string>): FormData {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (key === "files[]") continue;
    body.append(key, value);
  }
  return body;
}

export async function commentBug(client: ZentaoClient, bugId: string | undefined, comment: string | undefined): Promise<void> {
  if (!bugId || !comment) {
    console.error("用法: comment <bugId> <comment>");
    process.exit(1);
  }

  await client.login();
  const directResponse = await client.request(`action-comment-bug-${bugId}.html?onlybody=yes`, {
    method: "POST",
    headers: ajaxHeaders(client),
    body: new URLSearchParams({ comment }),
  });
  const directText = await directResponse.text();
  if (directResponse.ok && !isDenied(directText)) {
    console.log(JSON.stringify({
      success: true,
      mode: "action-comment",
      status: directResponse.status,
      bugId: Number(bugId),
      message: "评论已提交",
      preview: directText.slice(0, 300),
    }, null, 2));
    return;
  }

  const editPath = `bug-edit-${bugId}.html`;
  const editHtml = await client.text(editPath);
  const form = extractForms(editHtml)[0];
  if (!form || !("comment" in form.fields)) {
    console.log(JSON.stringify({
      success: false,
      mode: "bug-edit",
      bugId: Number(bugId),
      message: "通用评论被拒绝，且编辑表单中未找到 comment 字段",
      preview: directText.slice(0, 300),
    }, null, 2));
    return;
  }

  const fields: Record<string, string> = { ...form.fields, comment };
  const kuid = extractKuid(editHtml);
  if (kuid && !fields.uid) fields.uid = kuid;

  const response = await client.request(form.action || editPath, {
    method: "POST",
    headers: editHeaders(client, editPath),
    body: toMultipart(fields),
  });
  const text = await response.text();
  console.log(JSON.stringify({
    success: response.ok && !isDenied(text),
    mode: "bug-edit-comment",
    status: response.status,
    bugId: Number(bugId),
    message: response.ok && !isDenied(text) ? "备注已通过 Bug 编辑表单提交" : "备注提交失败，请运行 diagnose bug 查看实际表单",
    preview: text.slice(0, 300),
  }, null, 2));
}
