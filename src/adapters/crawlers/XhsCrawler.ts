import fetch from "node-fetch";
import { ISiteCrawler, CrawlerSession, PageData } from "../../core/ports/ISiteCrawler";
import { RealisticFingerprintProvider } from "../RealisticFingerprintProvider";

const XHS_DOMAIN = "xiaohongshu.com";
const COOKIE_NAMES = ["web_session", "a1", "id_token", "webBuild"];

/**
 * 小红书（xiaohongshu.com）特化爬虫。
 *
 * 签名说明（分两阶段）：
 * 第一阶段 — 基础框架：生成 X-t（时间戳）、X-s-common（设备标识）、
 *   X-s 使用简化版，确保请求可发出，验证 401/403 错误信息。
 * 第二阶段 — 完整签名：基于 XXTEA + MD5 算法完整复现 X-s。
 */
export class XhsCrawler implements ISiteCrawler {
  readonly name = "xiaohongshu";
  readonly domain = XHS_DOMAIN;
  private readonly fp = new RealisticFingerprintProvider();

  matches(url: string): boolean {
    try {
      return new URL(url).hostname.includes(XHS_DOMAIN);
    } catch {
      return false;
    }
  }

  async fetch(url: string, session?: CrawlerSession): Promise<PageData> {
    const cookies = session?.cookies ?? [];
    const missing = COOKIE_NAMES.filter(
      (n) => !cookies.some((c) => c.name === n),
    );
    if (missing.length > 0) {
      console.warn(`[XhsCrawler] 缺少必要 Cookie: ${missing.join(", ")}`);
    }

    const xt = Date.now().toString();
    const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const fp = this.fp.getFingerprint();

    const xsCommon = buildXsCommon(fp.userAgent, fp.platform);
    const xs = buildXs(xt);

    const start = Date.now();
    const res = await fetch(url, {
      headers: {
        "User-Agent": fp.userAgent,
        "Accept-Language": fp.acceptLanguage,
        "Accept": "application/json, text/plain, */*",
        "Referer": "https://www.xiaohongshu.com/",
        "Origin": "https://www.xiaohongshu.com",
        "X-t": xt,
        "X-s": xs,
        "X-s-common": xsCommon,
        ...(cookieStr ? { Cookie: cookieStr } : {}),
      },
    });
    const responseTime = Date.now() - start;

    return {
      url: res.url,
      statusCode: res.status,
      body: await res.text(),
      headers: Object.fromEntries(res.headers),
      responseTime,
      capturedAt: new Date().toISOString(),
    };
  }
}

// ── 签名函数（导出以便测试和 StubGenerator 复用） ─────

/**
 * 生成 X-s-common 头。
 * 基于 UA 和平台信息拼接，模拟小红书前端 SDK 格式。
 */
export function buildXsCommon(userAgent: string, platform: string): string {
  const uaBrief = userAgent.slice(0, 50).replace(/[^a-zA-Z0-9]/g, "_");
  return `${uaBrief}__${platform}__zh-CN__${Date.now().toString(36)}`;
}

/**
 * 生成 X-s 签名（第一阶段简化版）。
 * 当前为占位实现，返回基于 X-t 的 MD5 风格摘要。
 * 待第二阶段接入完整 XXTEA + MD5 算法。
 */
export function buildXs(xt: string): string {
  return simpleHash(xt + "xhs_sec_key_placeholder");
}

function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, "0") + "_" + Date.now().toString(36);
}
