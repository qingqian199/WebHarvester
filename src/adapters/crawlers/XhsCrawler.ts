import fetch from "node-fetch";
import { ISiteCrawler, CrawlerSession, PageData, FetchOptions } from "../../core/ports/ISiteCrawler";
import { RealisticFingerprintProvider } from "../RealisticFingerprintProvider";
import { generateXsHeader } from "../../utils/crypto/xhs-signer";

const XHS_DOMAIN = "xiaohongshu.com";
const XHS_API_HOST = "edith.xiaohongshu.com";

/**
 * 小红书 API 端点定义。
 *
 * name   — 用于 CLI/Web 显示的端点名。
 * path   — API 路径。
 * params — 默认查询参数（可覆盖）。
 * status — 可用性状态：
 *   "verified"    — 签名 + 参数全部验证通过，返回 code=0/1000
 *   "param_pending" — 签名通过（返回 JSON），但参数格式待确认
 *   "risk_ctrl"   — 签名通过，但触发账号风控
 */
export const XhsApiEndpoints: ReadonlyArray<{
  name: string;
  path: string;
  defaultParams: string;
  status: "verified" | "param_pending" | "risk_ctrl";
}> = [
  // ── 已验证可用 ──
  { name: "用户信息（当前）", path: "/api/sns/web/v2/user/me", defaultParams: "", status: "verified" },
  { name: "搜索建议", path: "/api/sns/web/v1/search/recommend", defaultParams: "keyword=%E5%8E%9F%E7%A5%9E", status: "verified" },

  // ── 签名有效，参数待修复 ──
  { name: "用户帖子列表", path: "/api/sns/web/v1/user_posted", defaultParams: "user_id=PLACEHOLDER&num=5", status: "param_pending" },
  { name: "收藏列表", path: "/api/sns/web/v1/board/user", defaultParams: "user_id=PLACEHOLDER&num=5", status: "param_pending" },
  { name: "其他用户信息", path: "/api/sns/web/v1/user/otherinfo", defaultParams: "target_user_id=PLACEHOLDER", status: "param_pending" },

  // ── 签名有效但触发风控 ──
  { name: "搜索笔记", path: "/api/sns/web/v1/search/notes", defaultParams: "", status: "risk_ctrl" },
] as const;

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
      "Accept": "application/json, text/plain, */*",
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
        "X-s-common": buildXsCommon(fp.userAgent, fp.platform),
        "x-api-version": "1.0",
        "x-request-id": `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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

  /**
   * 通过端点名称和参数执行 API 请求。
   * @param endpointName XhsApiEndpoints 中的 name。
   * @param params 查询参数字符串（如 "keyword=test"），不传则使用默认参数。
   * @param session 可选登录态。
   */
  async fetchApi(endpointName: string, params?: string, session?: CrawlerSession): Promise<PageData> {
    const ep = XhsApiEndpoints.find((e) => e.name === endpointName);
    if (!ep) throw new Error(`未知端点: ${endpointName}`);

    if (ep.status === "param_pending") {
      console.warn(`⚠️ ${ep.name} 参数格式待确认，参考: ${ep.defaultParams}`);
    }
    if (ep.status === "risk_ctrl") {
      console.warn(`⚠️ ${ep.name} 可能触发风控（code 300011），请确保请求间隔`);
    }

    const query = params ?? ep.defaultParams;
    const cleanParams = query.replace(/PLACEHOLDER/g, "");
    const url = `https://${XHS_API_HOST}${ep.path}${cleanParams ? "?" + cleanParams : ""}`;
    return this.fetch(url, session);
  }
}

// ── 辅助函数 ───────────────────────────────────────────

export function buildXsCommon(userAgent: string, platform: string): string {
  const info = {
    s0: Date.now().toString(36),
    s1: "",
    x0: "1",
    x1: "3.6.8",
    x2: platform === "Win32" ? "Windows" : platform === "MacIntel" ? "macOS" : "Linux",
    x3: "xhs-pc-web",
    x4: "4.0.16",
    x5: userAgent.slice(0, 80),
    x6: "zh-CN",
    x7: "",
  };
  return Buffer.from(JSON.stringify(info)).toString("base64");
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
