import fetch from "node-fetch";

const BASE_URL_DEFAULT = "http://localhost:3001";
const TIMEOUT_DEFAULT = 30000;

let _baseUrl = BASE_URL_DEFAULT;
let _timeout = TIMEOUT_DEFAULT;

export interface BossTokenResponse {
  stoken: string;
  traceid: string;
  cookies: Record<string, string>;
}

export interface BackendHealthResponse {
  status: string;
  services: Record<string, string>;
}

export function configureBackendClient(baseUrl: string, timeout: number): void {
  _baseUrl = baseUrl.replace(/\/+$/, "");
  _timeout = timeout;
}

async function request<T>(path: string, options?: { method?: string; body?: unknown }): Promise<T> {
  const url = `${_baseUrl}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), _timeout);

  try {
    const res = await fetch(url, {
      method: options?.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal as any,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`后端服务返回 ${res.status}: ${text}`);
    }

    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function getBossToken(): Promise<BossTokenResponse> {
  return request<BossTokenResponse>("/api/boss/token");
}

export async function refreshBossToken(): Promise<BossTokenResponse> {
  return request<BossTokenResponse>("/api/boss/token/refresh", { method: "POST" });
}

export async function getBossHealth(): Promise<{ status: string; ready: boolean; hasStoken: boolean; hasTraceid: boolean }> {
  return request("/api/boss/health");
}

export async function getBackendHealth(): Promise<BackendHealthResponse> {
  return request<BackendHealthResponse>("/health");
}
