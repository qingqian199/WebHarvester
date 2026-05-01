import fetch from "node-fetch";
import { ISiteCrawler, CrawlerSession, PageData, FetchOptions } from "../../core/ports/ISiteCrawler";
import { RealisticFingerprintProvider } from "../RealisticFingerprintProvider";
import { generateZse96, generateApiVersion } from "../../utils/crypto/zhihu-signer";
import { PlaywrightAdapter } from "../PlaywrightAdapter";
import { ConsoleLogger } from "../ConsoleLogger";

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

  // 🔶 待验证
  { name: "文章详情（专栏）", path: "/api/articles/{article_id}", status: "sig_pending" },
  { name: "文章推荐", path: "/api/articles/{article_id}/recommendation", params: "include=data%5B*%5D.article.column&limit=5", status: "sig_pending" },
  { name: "搜索预设词", path: "/api//v4/search/preset_words", status: "sig_pending" },
  { name: "文章评论", path: "/api/v4/comment_v5/articles/{article_id}/root_comment", params: "order_by=score&limit=5", status: "sig_pending" },
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
}
