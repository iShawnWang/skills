import type { AppConfig } from "./types.js";
import { extractTitle, findLoginForm, stripTags } from "./html.js";
import { createHash } from "node:crypto";

type RequestOptions = RequestInit & { rawPath?: boolean };

function md5(value: string): string {
  return createHash("md5").update(value).digest("hex");
}

export class ZentaoClient {
  private readonly cookies = new Map<string, string>();

  constructor(private readonly config: AppConfig) {}

  get baseUrl(): string {
    return this.config.baseUrl;
  }

  resolve(path: string): string {
    if (/^https?:\/\//i.test(path)) return path;
    const base = `${this.config.baseUrl.replace(/\/+$/, "")}/`;
    if (path.startsWith("/")) return new URL(path, base).toString();
    return new URL(path.replace(/^\/+/, ""), base).toString();
  }

  private cookieHeader(): string {
    return [...this.cookies.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
  }

  private storeCookies(headers: Headers): void {
    const anyHeaders = headers as Headers & { getSetCookie?: () => string[] };
    const values = anyHeaders.getSetCookie?.() ?? [];
    const fallback = headers.get("set-cookie");
    if (fallback) values.push(fallback);

    for (const header of values) {
      const first = header.split(";")[0];
      const eq = first.indexOf("=");
      if (eq <= 0) continue;
      this.cookies.set(first.slice(0, eq).trim(), first.slice(eq + 1).trim());
    }
  }

  async request(path: string, options: RequestOptions = {}): Promise<Response> {
    const headers = new Headers(options.headers);
    const cookie = this.cookieHeader();
    if (cookie) headers.set("cookie", cookie);
    if (!headers.has("user-agent")) headers.set("user-agent", "zentao-mcp-server/0.1");

    const response = await fetch(options.rawPath ? path : this.resolve(path), {
      ...options,
      headers,
      redirect: "manual",
    });
    this.storeCookies(response.headers);

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) return response;
      const next = /^https?:\/\//i.test(location) ? location : this.resolve(location);
      return this.request(next, { ...options, method: "GET", body: undefined, rawPath: true });
    }

    return response;
  }

  async text(path: string, options: RequestOptions = {}): Promise<string> {
    const response = await this.request(path, options);
    return response.text();
  }

  async login(): Promise<{ success: boolean; title: string; message: string }> {
    const loginHtml = await this.text("user-login.html");
    const form = findLoginForm(loginHtml);
    if (!form) {
      return { success: false, title: extractTitle(loginHtml), message: "未找到登录表单" };
    }

    const fields = { ...form.fields };
    if ("account" in fields) fields.account = this.config.username;
    else if ("username" in fields) fields.username = this.config.username;
    else if ("user" in fields) fields.user = this.config.username;
    else fields.account = this.config.username;

    const password = fields.verifyRand ? md5(`${md5(this.config.password)}${fields.verifyRand}`) : this.config.password;
    if ("password" in fields) fields.password = password;
    else fields.password = password;

    if ("passwordStrength" in fields) fields.passwordStrength = "1";
    if ("keepLogin" in fields) fields.keepLogin = "1";
    if ("keepLogin[]" in fields) fields["keepLogin[]"] = "1";
    if ("referer" in fields && !fields.referer) fields.referer = `${new URL(this.baseUrl).pathname}/`;

    const body = new URLSearchParams(fields);
    const target = form.action || "user-login.html";
    const html = await this.text(target, {
      method: form.method === "get" ? "GET" : "POST",
      headers: {
        "accept": "application/json, text/javascript, */*; q=0.01",
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "origin": new URL(this.baseUrl).origin,
        "referer": this.resolve("user-login.html"),
        "x-requested-with": "XMLHttpRequest",
      },
      body: form.method === "get" ? undefined : body,
    });

    const myHtml = await this.text("my/");
    const title = extractTitle(myHtml || html);
    const combinedText = stripTags(myHtml || html).toLowerCase();
    const failed = combinedText.includes("login") && (combinedText.includes("password") || combinedText.includes("account"));
    return {
      success: !failed,
      title,
      message: failed ? "登录后仍像登录页，请检查用户名、密码或登录字段" : "登录成功",
    };
  }
}
