import fetch from "node-fetch";
import { ISiteCrawler, CrawlerSession, PageData, FetchOptions } from "../../core/ports/ISiteCrawler";
import { RealisticFingerprintProvider } from "../RealisticFingerprintProvider";
import { generateZse96, generateApiVersion } from "../../utils/crypto/zhihu-signer";
import { PlaywrightAdapter } from "../PlaywrightAdapter";
import { ConsoleLogger } from "../ConsoleLogger";
import { UnitResult } from "../../core/models/ContentUnit";

export const ZhihuFallbackEndpoints: ReadonlyArray<{
  name: string; pageUrl: string; dataPath: string;
}> = [
  { name: "知乎搜索", pageUrl: "https://www.zhihu.com/search?type=content&q={keyword}", dataPath: "search.entries" },
  { name: "用户主页", pageUrl: "https://www.zhihu.com/people/{member_id}", dataPath: "user.profile" },
  { name: "文章详情", pageUrl: "https://zhuanlan.zhihu.com/p/{article_id}", dataPath: "article.content" },
];

const ZHIHU_DOMAIN = "zhihu.com";
const ZHIHU_API_HOSTS = ["www.zhihu.com", "zhuanlan.zhihu.com"];

/** 知乎 API 端点定义。 */
export interface ZhihuEndpointDef {
  name: string;
  path: string;
  method?: string;
  params?: string;
  status?: "verified" | "sig_pending";
}

export const ZhihuApiEndpoints: ReadonlyArray<ZhihuEndpointDef> = [
  // ✅ 已验证（x-zse-96 签名通过）
  { name: "当前用户", path: "/api/v4/me", params: "include=email", status: "verified" },
  { name: "成员信息", path: "/api/v4/members/{member_id}", params: "include=gender,locations,employments", status: "verified" },
  { name: "热门搜索", path: "/api/v4/search/hot_search", status: "verified" },

  // ✅ 采集结果确认参数，签名已验证通过
  { name: "专栏文章推荐", path: "/api/articles/{article_id}/recommendation", params: "include=data%5B*%5D.article.column&limit=5", status: "verified" },
  { name: "关注关系", path: "/api/v4/members/{member_id}/relations/mutuals", params: "include=data%5B*%5D.answer_count&limit=5", status: "verified" },
  { name: "搜索预设词", path: "/api/v4/search/preset_words", status: "verified" },
  { name: "文章关系", path: "/api/v4/articles/{article_id}/relationship", params: "desktop=true", status: "verified" },
  { name: "专栏投稿请求", path: "/api/v4/articles/{article_id}/contribute_requests", status: "verified" },
  { name: "文章标签", path: "/api/v4/articles/{article_id}/labels/v3", status: "verified" },
  { name: "会员权益弹窗", path: "/api/v4/unlimited/vip_rights/popup", params: "token=", status: "verified" },
  { name: "专栏投稿", path: "/api/v4/members/{member_id}/column-contributions", params: "limit=5", status: "verified" },

  // 🔶 待验证
  { name: "文章评论", path: "/api/v4/comment_v5/articles/{article_id}/root_comment", params: "order_by=score&limit=5", status: "sig_pending" },
  { name: "评论配置", path: "/api/v4/comment_v5/articles/{article_id}/config", status: "sig_pending" },
];

/**
 * 知乎（zhihu.com）特化爬虫。
 * 使用 x-zse-96 签名访问 API。
 */
export class ZhihuCrawler implements ISiteCrawler {
  readonly name = "zhihu";
  readonly domain = ZHIHU_DOMAIN;
  private readonly fp = new RealisticFingerprintProvider();

  matches(url: string): boolean {
    try {
      const host = new URL(url).hostname;
      return ZHIHU_API_HOSTS.some((h) => host.includes(h)) || host.includes(ZHIHU_DOMAIN);
    } catch {
      return false;
    }
  }

  async fetch(url: string, session?: CrawlerSession, options?: FetchOptions): Promise<PageData> {
    const cookieStr = (session?.cookies ?? []).map((c) => `${c.name}=${c.value}`).join("; ");
    const fp = this.fp.getFingerprint();

    const parsed = new URL(url);
    const pathOnly = parsed.pathname;
    const queryOnly = parsed.search.replace("?", "");

    const headers: Record<string, string> = {
      "User-Agent": fp.userAgent,
      "Accept-Language": fp.acceptLanguage,
      "Accept": "application/json, text/plain, */*",
      "Referer": "https://www.zhihu.com/",
      "Origin": "https://www.zhihu.com",
      "x-api-version": generateApiVersion(),
      "x-zse-96": generateZse96(pathOnly, queryOnly),
      ...(cookieStr ? { Cookie: cookieStr } : {}),
      ...(options?.body ? { "Content-Type": "application/json;charset=UTF-8" } : {}),
    };

    const method = options?.method ?? "GET";
    const start = Date.now();

    const res = await fetch(url, {
      method,
      headers,
      ...(method === "POST" && options?.body ? { body: options.body } : {}),
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

  async fetchApi(endpointName: string, params?: Record<string, string>, session?: CrawlerSession): Promise<PageData> {
    const ep = ZhihuApiEndpoints.find((e) => e.name === endpointName);
    if (!ep) throw new Error(`未知端点: ${endpointName}`);

    let apiPath = ep.path;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        apiPath = apiPath.replace(`{${k}}`, encodeURIComponent(v));
      }
    }

    const query = ep.params && params ? this.fillParams(ep.params, params) : ep.params ?? "";
    // 专栏相关端点走 zhuanlan.zhihu.com
    const baseHost = ep.path.startsWith("/api/articles") ? "zhuanlan.zhihu.com" : "www.zhihu.com";
    const url = `https://${baseHost}${apiPath}${query ? "?" + query : ""}`;
    return this.fetch(url, session);
  }

  /**
   * 兜底方案：通过浏览器引擎从页面 HTML 提取数据。
   */
  async fetchPageData(pageType: string, params: Record<string, string>, session?: CrawlerSession): Promise<PageData> {
    const urlMap: Record<string, string> = {
      search: `https://www.zhihu.com/search?type=content&q=${encodeURIComponent(params.keyword || "")}`,
      article: `https://zhuanlan.zhihu.com/p/${params.article_id || ""}`,
      profile: `https://www.zhihu.com/people/${params.member_id || ""}`,
    };
    const url = urlMap[pageType];
    if (!url) throw new Error(`未知页面类型: ${pageType}`);

    const logger = new ConsoleLogger("info");
    const browser = new PlaywrightAdapter(logger);

    try {
      const startTime = Date.now();
      await browser.launch(url, session ? {
        cookies: session.cookies.map((c) => ({
          name: c.name, value: c.value, domain: c.domain ?? ".zhihu.com",
          path: "/", httpOnly: false, secure: false, sameSite: "Lax" as const,
        })),
        localStorage: {}, sessionStorage: {}, createdAt: Date.now(), lastUsedAt: Date.now(),
      } : undefined);
      await new Promise((r) => setTimeout(r, 3000));

      const title = await browser.executeScript<string>("document.title").catch(() => "");
      const bodyText = await browser.executeScript<string>(
        "(() => { const m = document.querySelector('.RichText'); return m ? m.innerText.slice(0,5000) : document.body.innerText.slice(0,5000); })()",
      ).catch(() => "");

      const finishTime = Date.now();
      return {
        url, statusCode: 200,
        body: JSON.stringify({ title, content: bodyText }),
        headers: { "content-type": "application/json;charset=utf-8" },
        responseTime: finishTime - startTime,
        capturedAt: new Date().toISOString(),
      };
    } finally {
      await browser.close();
    }
  }

  private fillParams(tpl: string, params: Record<string, string>): string {
    return tpl.replace(/\{(\w+)\}/g, (_, k) => params[k] || k);
  }

  async collectUnits(units: string[], params: Record<string, string>, session?: CrawlerSession, _authMode?: string): Promise<UnitResult[]> {
    const results: UnitResult[] = [];
    for (const unit of units) {
      const start = Date.now();
      try {
        switch (unit) {
          case "zhihu_user_info": {
            const r = await this.fetchApi("当前用户", {}, session);
            results.push({ unit, status: "success", data: JSON.parse(r.body), method: "signature", responseTime: r.responseTime });
            break;
          }
          case "zhihu_search": {
            const r = await this.fetchPageData("search", { keyword: params.keyword || "" }, session);
            const parsed = JSON.parse(r.body);
            results.push({ unit, status: "success", data: parsed, method: "html_extract", responseTime: r.responseTime });
            break;
          }
          case "zhihu_article": {
            const r = await this.fetchPageData("article", { article_id: params.article_id || "" }, session);
            const parsed = JSON.parse(r.body);
            results.push({ unit, status: "success", data: parsed, method: "html_extract", responseTime: r.responseTime });
            break;
          }
          case "zhihu_hot_search": {
            const r = await this.fetchApi("热门搜索", {}, session);
            const d = JSON.parse(r.body);
            results.push({ unit, status: d.code === 0 || r.statusCode === 200 ? "success" : "partial", data: d, method: "signature", responseTime: r.responseTime });
            break;
          }
          default:
            results.push({ unit, status: "failed", data: null, method: "none", error: "未知单元", responseTime: 0 });
        }
      } catch (e: any) {
        results.push({ unit, status: "failed", data: null, method: "none", error: e.message, responseTime: Date.now() - start });
      }
    }
    return results;
  }
}
