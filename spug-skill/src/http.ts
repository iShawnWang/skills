import { randomUUID } from "node:crypto";

import type { ApiResponse } from "./types.js";

export interface RequestOptions {
  body?: unknown;
  headers?: Record<string, string>;
  searchParams?: URLSearchParams;
}

export class SpugHttpError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "SpugHttpError";
    this.status = status;
    this.payload = payload;
  }
}

export class HttpClient {
  private readonly baseUrl: URL;
  private token: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = new URL(baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  }

  setToken(token: string): void {
    this.token = token;
  }

  async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const url = new URL(path.replace(/^\//, ""), this.baseUrl);
    if (options.searchParams) {
      url.search = options.searchParams.toString();
    }

    const headers: Record<string, string> = {
      Accept: "application/json, text/plain, */*",
      ...options.headers,
    };

    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    headers["x-token"] = this.token ?? randomUUID().replace(/-/g, "");

    const response = await fetch(url, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

    const text = await response.text();
    const payload = text.length === 0 ? null : safeParseJson(text);

    if (!response.ok) {
      throw new SpugHttpError(`HTTP ${response.status} ${response.statusText}`, response.status, payload);
    }

    if (payload === null || typeof payload !== "object") {
      throw new SpugHttpError("Expected JSON response body", response.status, payload);
    }

    const apiPayload = payload as ApiResponse<T>;
    if (apiPayload.error) {
      throw new SpugHttpError(apiPayload.error, response.status, payload);
    }

    return apiPayload.data;
  }
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
