import type { FormSummary, ParsedForm } from "./types.js";

export function decodeEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
}

export function stripTags(input: string): string {
  return decodeEntities(input.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function getAttr(tag: string, name: string): string | undefined {
  const pattern = new RegExp(`${name}\\s*=\\s*("[^"]*"|'[^']*'|[^\\s>]+)`, "i");
  const match = tag.match(pattern);
  if (!match) return undefined;
  return decodeEntities(match[1].replace(/^['"]|['"]$/g, ""));
}

export function getAttribute(tag: string, name: string): string | undefined {
  return getAttr(tag, name);
}

export function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripTags(match[1]) : "";
}

export function extractForms(html: string): ParsedForm[] {
  const forms: ParsedForm[] = [];
  for (const formMatch of html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)) {
    const formTag = formMatch[1] ?? "";
    const body = formMatch[2] ?? "";
    const fields: Record<string, string> = {};
    for (const inputMatch of body.matchAll(/<(input|textarea|select)\b([^>]*)>(?:([\s\S]*?)<\/\1>)?/gi)) {
      const tagName = inputMatch[1].toLowerCase();
      const attrs = inputMatch[2] ?? "";
      const name = getAttr(attrs, "name");
      if (!name) continue;
      const type = (getAttr(attrs, "type") ?? "").toLowerCase();
      if ((type === "checkbox" || type === "radio") && !/\bchecked\b/i.test(attrs)) continue;

      let value = getAttr(attrs, "value") ?? "";
      if (tagName === "textarea" && inputMatch[3]) {
        value = stripTags(inputMatch[3]);
      } else if (tagName === "select" && inputMatch[3]) {
        const options = [...inputMatch[3].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)];
        const selected = options.find((option) => /\bselected\b/i.test(option[1])) ?? options[0];
        if (selected) value = getAttr(selected[1], "value") ?? stripTags(selected[2]);
      }
      fields[name] = value;
    }
    forms.push({
      action: getAttr(formTag, "action") ?? "",
      method: (getAttr(formTag, "method") ?? "get").toLowerCase(),
      fields,
    });
  }
  return forms;
}

export function summarizeForms(html: string): FormSummary[] {
  return extractForms(html).map((form) => ({
    action: form.action,
    method: form.method,
    inputs: Object.keys(form.fields),
  }));
}

export function findLoginForm(html: string): ParsedForm | undefined {
  const forms = extractForms(html);
  return forms.find((form) => ["account", "username", "user", "password"].some((name) => name in form.fields)) ?? forms[0];
}
