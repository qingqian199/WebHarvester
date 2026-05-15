import { SessionValidation } from "../core/ports/ISessionManager";

/** 简化的 session 数据（用于爬虫上下文传递） */
export interface SessionData {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path?: string;
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: string;
  }>;
  localStorage: Record<string, string>;
}

/** Crawler 构造函数签名 */
export interface CrawlerConstructor {
  new (proxyProvider?: unknown): {
    collectUnits: (units: string[], params: Record<string, string>, session?: SessionData, authMode?: string) => Promise<unknown[]>;
  };
}

export type { SessionValidation };

