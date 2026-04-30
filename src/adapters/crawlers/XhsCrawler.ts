import fetch from "node-fetch";
import { ISiteCrawler, CrawlerSession, PageData, FetchOptions } from "../../core/ports/ISiteCrawler";
import { RealisticFingerprintProvider } from "../RealisticFingerprintProvider";
import { generateXsHeader } from "../../utils/crypto/xhs-signer";

const XHS_DOMAIN = "xiaohongshu.com";
const XHS_API_HOST = "edith.xiaohongshu.com";

/**
 * 小红书（xiaohongshu.com）特化爬虫。
 *
 * API 请求使用 Phase 2 完整签名（XXTEA + MD5 + 自定义 Base64），
 * 非 API 请求使用 Phase 1 简化签名（兼容 HTML 页面）。
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

  async fetch(url: string, session?: CrawlerSession, options?: FetchOptions): Promise<PageData> {
    const cookies = session?.cookies ?? [];
    const cookieMap: Record<string, string> = {};
    for (const c of cookies) cookieMap[c.name] = c.value;
    const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const fp = this.fp.getFingerprint();

    const method = options?.method ?? "GET";
    const body = options?.body ?? "";

    const headers: Record<string, string> = {
      "User-Agent": fp.userAgent,
      "Accept-Language": fp.acceptLanguage,
      "Referer": "https://www.xiaohongshu.com/",
      "Origin": "https://www.xiaohongshu.com",
      ...(cookieStr ? { Cookie: cookieStr } : {}),
    };

    const parsed = new URL(url);
    const isApi = parsed.hostname === XHS_API_HOST;

    if (isApi) {
      // Phase 2: 完整签名（签名数据包含 body）
      const apiPath = parsed.pathname + (method === "GET" ? parsed.search : "");
      const signData = method === "POST" ? body : parsed.search.replace("?", "");
      const xsHeaders = generateXsHeader(apiPath, signData, cookieMap);
      Object.assign(headers, xsHeaders, {
        "Accept": "application/json, text/plain, */*",
        "X-s-common": buildXsCommon(fp.userAgent, fp.platform),
        ...(method === "POST" ? { "Content-Type": options?.contentType ?? "application/json;charset=UTF-8" } : {}),
      });
    } else {
      // Phase 1: 简化签名（HTML 页面）
      const xt = Date.now().toString();
      Object.assign(headers, {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "X-t": xt,
        "X-s": buildXsLegacy(xt),
        "X-s-common": buildXsCommon(fp.userAgent, fp.platform),
      });
    }

    const start = Date.now();
    const res = await fetch(url, {
      method,
      headers,
      ...(method === "POST" && body ? { body } : {}),
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

// ── 辅助函数 ───────────────────────────────────────────

export function buildXsCommon(userAgent: string, platform: string): string {
  const uaBrief = userAgent.slice(0, 50).replace(/[^a-zA-Z0-9]/g, "_");
  return `${uaBrief}__${platform}__zh-CN__${Date.now().toString(36)}`;
}

function buildXsLegacy(xt: string): string {
  const input = xt + "xhs_sec_key_placeholder";
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, "0") + "_" + Date.now().toString(36);
}
