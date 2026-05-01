import fetch from "node-fetch";
import { ISiteCrawler, CrawlerSession, PageData, FetchOptions } from "../../core/ports/ISiteCrawler";
import { RealisticFingerprintProvider } from "../RealisticFingerprintProvider";
import { generateXsHeader } from "../../utils/crypto/xhs-signer";

const XHS_DOMAIN = "xiaohongshu.com";
const XHS_API_HOST = "edith.xiaohongshu.com";

/**
 * 小红书 API 端点定义（签名直连 — 已验证可用）。
 *
 * name   — 用于 CLI/Web 显示的端点名。
 * path   — API 路径。
 * params — 默认查询参数。
 */
/** 小红书 API 端点定义。 */
export interface XhsEndpointDef {
  name: string;
  path: string;
  /** HTTP 方法，默认 GET。 */
  method?: string;
  /** 查询参数字符串（GET），或 JSON 体格式 POST 时默认 body 的模板。用 {} 表示运行时填充。 */
  params?: string;
  /**
   * POST 时请求体模板 JSON。字段值中的 {} 在 fetchApi 时会被替换。
   */
  bodyTemplate?: Record<string, any>;
  /** 端点状态：verified / risk_ctrl / sig_pending */
  status?: "verified" | "risk_ctrl" | "sig_pending";
}

export const XhsApiEndpoints: ReadonlyArray<XhsEndpointDef> = [
  // ── ✅ 已验证可用（签名通过，code=0/1000） ──
  { name: "用户信息", path: "/api/sns/web/v2/user/me", status: "verified" },
  { name: "搜索建议", path: "/api/sns/web/v1/search/recommend", params: "keyword=%E5%8E%9F%E7%A5%9E", status: "verified" },
  { name: "系统配置", path: "/api/sns/web/v1/system/config", status: "verified" },
  { name: "区域列表", path: "/api/sns/web/v1/zones", status: "verified" },
  { name: "未读消息", path: "/api/sns/web/unread_count", status: "verified" },

  // ── ⛔ 触发风控（签名有效但被限，code=300011） ──
  { name: "搜索笔记", path: "/api/sns/web/v1/search/notes", method: "POST",
    bodyTemplate: { keyword: "原神", page: 1, page_size: 20, search_id: "{search_id}", sort: "general", note_type: 0, ext_flags: [], image_formats: ["jpg", "webp", "avif"] },
    status: "risk_ctrl" },

  // ── 🔶 签名偏差（采集结果有数据，签名后返回 -1） ──
  { name: "搜索一站式", path: "/api/sns/web/v1/search/onebox", method: "POST",
    bodyTemplate: { keyword: "原神", search_id: "{search_id}", biz_type: "web_search_user", request_id: "{request_id}" },
    status: "sig_pending" },
  { name: "搜索筛选", path: "/api/sns/web/v1/search/filter", params: "keyword=%E5%8E%9F%E7%A5%9E&search_id={search_id}", status: "sig_pending" },
  { name: "收藏列表", path: "/api/sns/web/v1/board/user", params: "user_id=PLACEHOLDER&num=15&page=1", status: "sig_pending" },
] as const;

/**
 * 兜底方案端点（通过浏览器引擎提取，不走特化签名）。
 * 签名算法无法通过时，通过 Page.evaluate 从 HTML 的 __INITIAL_STATE__ 提取数据。
 */
export const XhsFallbackEndpoints: ReadonlyArray<{
  name: string;
  /** 需要打开的页面 URL 模板。用 {} 表示参数占位。 */
  pageUrl: string;
  /** 页面加载后用于提取数据的 JS 表达式。 */
  extractScript: string;
}> = [
  {
    name: "搜索笔记",
    pageUrl: "https://www.xiaohongshu.com/search_result?keyword={keyword}",
    extractScript: "JSON.parse(document.querySelector('script:contains(\"__INITIAL_STATE__\")')?.textContent?.replace('window.__INITIAL_STATE__=','')?.split(';')[0] || '{}')",
  },
  {
    name: "用户主页",
    pageUrl: "https://www.xiaohongshu.com/user/profile/{user_id}",
    extractScript: "JSON.parse(document.querySelector('script:contains(\"__INITIAL_STATE__\")')?.textContent?.replace('window.__INITIAL_STATE__=','')?.split(';')[0] || '{}')",
  },
  {
    name: "笔记详情",
    pageUrl: "https://www.xiaohongshu.com/discovery/item/{note_id}",
    extractScript: "JSON.parse(document.querySelector('script:contains(\"__INITIAL_STATE__\")')?.textContent?.replace('window.__INITIAL_STATE__=','')?.split(';')[0] || '{}')",
  },
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
  async fetchApi(endpointName: string, params?: Record<string, string>, session?: CrawlerSession): Promise<PageData> {
    const ep = XhsApiEndpoints.find((e) => e.name === endpointName);
    if (!ep) throw new Error(`未知端点: ${endpointName}`);

    const method = ep.method ?? "GET";

    if (method === "POST" && ep.bodyTemplate) {
      const body = this.fillTemplate(ep.bodyTemplate, params ?? {});
      const bodyStr = JSON.stringify(body);
      const url = `https://${XHS_API_HOST}${ep.path}`;
      return this.fetch(url, session, { method: "POST", body: bodyStr,
        contentType: "application/json;charset=UTF-8" });
    }

    const query = params
      ? Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")
      : (ep.params ?? "");
    const url = `https://${XHS_API_HOST}${ep.path}${query ? "?" + query : ""}`;
    return this.fetch(url, session);
  }

  private fillTemplate(tpl: Record<string, any>, params: Record<string, string>): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(tpl)) {
      if (typeof v === "string" && v.startsWith("{") && v.endsWith("}")) {
        const key = v.slice(1, -1);
        result[k] = params[key] ?? v;
      } else if (typeof v === "string" && params[k]) {
        result[k] = params[k];
      } else {
        result[k] = v;
      }
    }
    return result;
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
