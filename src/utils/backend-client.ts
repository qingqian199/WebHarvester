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

export interface ProxyStatusResponse {
  enabled: boolean;
  totalProxies: number;
  availableProxies: number;
  mode: string;
  configured: boolean;
  reason?: string;
}

export interface RateLimitStatusResponse {
  sites: Record<string, { successRate: number; isPaused: boolean; backoffLevel: number }>;
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

// ── BOSS 直聘 ──

export async function getBossToken(): Promise<BossTokenResponse> {
  return request<BossTokenResponse>("/api/boss/token");
}

export async function refreshBossToken(): Promise<BossTokenResponse> {
  return request<BossTokenResponse>("/api/boss/token/refresh", { method: "POST" });
}

export async function getBossHealth(): Promise<{ status: string; ready: boolean; hasStoken: boolean; hasTraceid: boolean }> {
  return request("/api/boss/health");
}

// ── 全局 ──

export async function getBackendHealth(): Promise<BackendHealthResponse> {
  return request<BackendHealthResponse>("/health");
}

// ── 代理池 ──

export async function getProxyStatus(): Promise<ProxyStatusResponse> {
  return request<ProxyStatusResponse>("/api/proxy/status");
}

export async function triggerProxyHealthCheck(): Promise<{ ok: boolean; checked: number; available: number }> {
  return request("/api/proxy/healthcheck", { method: "POST" });
}

// ── 限流 ──

export async function getRateLimitStatus(): Promise<RateLimitStatusResponse> {
  return request<RateLimitStatusResponse>("/api/ratelimit/status");
}

// ── 抖音签名 ──

export async function getDouyinHealth(): Promise<{ status: string; cachedSignatures: number }> {
  return request("/api/douyin/health");
}

export async function getDouyinSignature(endpoint: string): Promise<{ endpoint: string; signature: any }> {
  return request(`/api/douyin/sign?endpoint=${encodeURIComponent(endpoint)}`);
}

// ── 小红书签名 ──

export async function xhsSignRequest(payload: { apiPath: string; data?: string; cookies?: string; userAgent?: string; platform?: string }): Promise<any> {
  return request("/api/xiaohongshu/sign", { method: "POST", body: payload });
}

// ── TikTok 签名 ──

export async function ttSignRequest(payload: { url: string; method?: string; body?: string; headers?: Record<string, string>; cookie?: string }): Promise<any> {
  return request("/api/tiktok/sign", { method: "POST", body: payload });
}
