import { extractForms } from "../html.js";
import type { ZentaoClient } from "../client.js";

export async function closeBug(
  client: ZentaoClient,
  bugId: string | undefined,
  resolution = "fixed",
  comment = "",
){
  if (!bugId) {
    throw new Error("bugId is required");
  }

  await client.login();
  const closePath = `bug-close-${bugId}.html`;
  const html = await client.text(closePath);
  const form = extractForms(html).find((item) => item.action.includes("close") || "resolution" in item.fields) ?? extractForms(html)[0];
  const fields = { ...(form?.fields ?? {}) };
  fields.resolution = resolution;
  if (comment) fields.comment = comment;

  const response = await client.request(form?.action || closePath, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields),
  });
  const text = await response.text();
  return {
    success: response.ok,
    status: response.status,
    bugId: Number(bugId),
    resolution,
    message: response.ok ? "关闭请求已提交" : "关闭失败，请运行 diagnose bug 查看实际表单",
    preview: text.slice(0, 300),
  };
}
