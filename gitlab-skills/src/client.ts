import type { AppConfig } from "./types.js";

/**
 * GitLab API 客户端
 * 封装 fetch 请求，统一处理认证、URL 拼接和错误
 */
export class GitLabClient {
  private apiUrl: string;
  private headers: Record<string, string>;

  constructor(config: AppConfig) {
    this.apiUrl = `${config.endpoint.replace(/\/+$/, "")}/api/v4`;
    this.headers = {
      "PRIVATE-TOKEN": config.accessToken,
      "Content-Type": "application/json",
    };
  }

  /**
   * 发送 GET 请求
   */
  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    let url = `${this.apiUrl}${path}`;
    if (params) {
      const searchParams = new URLSearchParams(params);
      url += `?${searchParams.toString()}`;
    }
    const response = await fetch(url, { headers: this.headers });
    return this.handleResponse<T>(response);
  }

  /**
   * 发送 POST 请求
   */
  async post<T>(path: string, body: Record<string, string | boolean>): Promise<T> {
    const response = await fetch(`${this.apiUrl}${path}`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
    });
    return this.handleResponse<T>(response);
  }

  /**
   * 发送 PUT 请求
   */
  async put<T>(path: string, body?: Record<string, string | boolean>): Promise<T> {
    const response = await fetch(`${this.apiUrl}${path}`, {
      method: "PUT",
      headers: this.headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    return this.handleResponse<T>(response);
  }

  /**
   * 统一处理 HTTP 响应
   */
  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const text = await response.text();
      let detail: string;
      try {
        const json = JSON.parse(text);
        detail = json.message || json.error || text;
      } catch {
        detail = text;
      }
      throw new Error(`GitLab API 错误 (${response.status}): ${detail}`);
    }
    return (await response.json()) as T;
  }
}
