import { CrawlerSession, PageData, FetchOptions } from "../../core/ports/ISiteCrawler";
import { IProxyProvider } from "../../core/ports/IProxyProvider";
import { generateZse96, generateApiVersion } from "../../utils/crypto/zhihu-signer";
import { UnitResult } from "../../core/models/ContentUnit";
import { resolveZhihuUrl } from "../../utils/url-resolver";
import { buildBrowserHeaders } from "../../utils/browser-env";
import { BaseCrawler } from "./BaseCrawler";

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

  // 回答评论
  { name: "回答评论", path: "/api/v4/answers/{answer_id}/comments", params: "limit=20&cursor={cursor}", status: "sig_pending" },
  { name: "回答子回复", path: "/api/v4/comments/{comment_id}/child_comments", params: "limit=20&cursor={cursor}", status: "sig_pending" },
];

/**
 * 知乎（zhihu.com）特化爬虫。
 * 使用 x-zse-96 签名访问 API。
 */
export class ZhihuCrawler extends BaseCrawler {
  readonly name = "zhihu";
  readonly domain = ZHIHU_DOMAIN;

  constructor(proxyProvider?: IProxyProvider) { super("zhihu", proxyProvider); this.registerHandlers(); }

  private registerHandlers(): void {
    this.unitHandlers.set("zhihu_user_info", async (unit, params, session) => {
      if (this.rateLimiter.isPaused) {
        return { unit, status: "partial", data: null, method: "none", error: "站点冷却中，跳过签名请求", responseTime: 0 };
      }
      const r = await this.fetchApi("当前用户", {}, session);
      return { unit, status: "success", data: JSON.parse(r.body), method: "signature", responseTime: r.responseTime };
    });

    this.unitHandlers.set("zhihu_search", async (unit, params, session) => {
      const r = await this.fetchPageData("search", { keyword: params.keyword || "" }, session);
      const parsed = JSON.parse(r.body);
      return { unit, status: "success", data: parsed, method: "html_extract", responseTime: r.responseTime };
    });

    this.unitHandlers.set("zhihu_article", async (unit, params, session) => {
      const r = await this.fetchPageData("article", { article_id: params.article_id || "" }, session);
      const parsed = JSON.parse(r.body);
      return { unit, status: "success", data: parsed, method: "html_extract", responseTime: r.responseTime };
    });

    this.unitHandlers.set("zhihu_hot_search", async (unit, params, session) => {
      if (this.rateLimiter.isPaused) {
        return { unit, status: "partial", data: null, method: "none", error: "站点冷却中，跳过签名请求", responseTime: 0 };
      }
      const r = await this.fetchApi("热门搜索", {}, session);
      const d = JSON.parse(r.body);
      return { unit, status: d.code === 0 || r.statusCode === 200 ? "success" : "partial", data: d, method: "signature", responseTime: r.responseTime };
    });

    this.unitHandlers.set("zhihu_comments", async (unit, params, session) => {
      const aid = params.answer_id || params.article_id || "";
      if (!aid) return { unit, status: "failed", data: null, method: "none", error: "缺少 answer_id", responseTime: 0 };
      const maxPages = Math.min(parseInt(params.max_pages || "3"), 10);
      let allComments: any[] = [];
      let totalTime = 0;
      let cursor = "";
      for (let page = 0; page < maxPages; page++) {
        try {
          const r = await this.fetchApi("回答评论", { answer_id: aid, cursor }, session);
          const d = JSON.parse(r.body);
          totalTime += r.responseTime;
          if (Array.isArray(d.data)) {
            allComments = allComments.concat(d.data);
            if (d.paging?.is_end) break;
            cursor = d.paging?.next || "";
          } else break;
        } catch { break; }
      }
      return { unit, status: allComments.length > 0 ? "success" : "partial", data: { data: allComments, paging: { totals: allComments.length } }, method: "signature", responseTime: totalTime };
    });

    this.unitHandlers.set("zhihu_sub_replies", async (unit, params, session, _authMode, results) => {
      const aid2 = params.answer_id || "";
      if (!aid2) return { unit, status: "failed", data: null, method: "none", error: "缺少 answer_id", responseTime: 0 };
      const root = params.root || "";
      const maxSub = Math.min(parseInt(params.max_sub_reply_pages || "5"), 20);

      let rootItems: any[];
      if (root) {
        rootItems = [{ id: root }];
      } else {
        const commentsResult: any = results?.find((r) => r.unit === "zhihu_comments" && r.status === "success");
        if (!commentsResult) return { unit, status: "failed", data: null, method: "none", error: "自动展开子回复需要先勾选「回答评论」", responseTime: 0 };
        rootItems = commentsResult.data?.data || [];
        if (rootItems.length === 0) return { unit, status: "success", data: { data: [], paging: { totals: 0 } }, method: "signature", responseTime: 0 };
      }

      const traverseResult = await this.traverseSubReplies(rootItems, {
        rootIdExtractor: (item: any) => String(item.id),
        maxPages: maxSub,
        staggerMs: 500,
        fetchPage: async (rootId, cursor) => {
          const r = await this.fetchApi("回答子回复", { comment_id: String(rootId), cursor: String(cursor) }, session);
          const d = JSON.parse(r.body);
          if (Array.isArray(d.data)) {
            return {
              replies: d.data,
              hasMore: !(d.paging?.is_end ?? true),
              nextCursor: d.paging?.next || "",
              responseTime: r.responseTime,
            };
          }
          return { replies: [], hasMore: false, nextCursor: "", responseTime: 0 };
        },
      });

      return {
        unit, status: "success",
        data: { data: traverseResult.byRpid, paging: { totals: traverseResult.totalReplies } },
        method: "signature",
        responseTime: traverseResult.totalTime,
      };
    });
  }

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
    const baseHeaders = buildBrowserHeaders(fp, "https://www.zhihu.com/");
    const headers: Record<string, string> = {
      ...baseHeaders,
      "Referer": "https://www.zhihu.com/",
      "Origin": "https://www.zhihu.com",
      "x-api-version": generateApiVersion(),
      "x-zse-96": generateZse96(parsed.pathname, parsed.search.replace("?", "")),
      ...(cookieStr ? { Cookie: cookieStr } : {}),
      ...(options?.body ? { "Content-Type": "application/json;charset=UTF-8" } : {}),
    };
    const method = options?.method ?? "GET";
    await this.rateLimiter.throttle();
    const start = Date.now();
    const res = await fetch(url, { method, headers, ...(method === "POST" && options?.body ? { body: options.body } : {}) });
    const responseTime = Date.now() - start;
    return { url: res.url, statusCode: res.status, body: await res.text(), headers: Object.fromEntries(res.headers), responseTime, capturedAt: new Date().toISOString() };
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
    return this.fetchWithRetry(url, session);
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
    const selector = pageType === "article" ? ".RichText" : undefined;
    const { browser, startTime } = await this.fetchPageContent(url, session, ".zhihu.com", selector);
    try {
      await browser.executeScript("window.scrollTo(0, " + (200 + Math.floor(Math.random() * 600)) + ")").catch(() => {});
      await new Promise((r) => setTimeout(r, 500));
      const title = await browser.executeScript<string>("document.title").catch(() => "");
      const bodyText = await browser.executeScript<string>(
        "(() => { const m = document.querySelector('.RichText'); return m ? m.innerText.slice(0,5000) : document.body.innerText.slice(0,5000); })()",
      ).catch(() => "");
      return { url, statusCode: 200, body: JSON.stringify({ title, content: bodyText }),
        headers: { "content-type": "application/json;charset=utf-8" },
        responseTime: Date.now() - startTime, capturedAt: new Date().toISOString() };
    } finally {
      await browser.close();
    }
  }

  private fillParams(tpl: string, params: Record<string, string>): string {
    return tpl.replace(/\{(\w+)\}/g, (_, k) => params[k] || k);
  }

  async collectUnits(units: string[], params: Record<string, string>, session?: CrawlerSession, _authMode?: string): Promise<UnitResult[]> {
    if (params.url) {
      const resolved = resolveZhihuUrl(params.url);
      for (const [k, v] of Object.entries(resolved)) {
        if (!params[k]) params[k] = v;
      }
    }
    const results: UnitResult[] = [];

    const shuffled = [...units];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const paused = this.rateLimiter.isPaused;
    if (paused) this.logger.warn("⏸️ [zhihu] 站点冷却中，后续采集将降级到页面提取");

    for (const unit of shuffled) {
      const start = Date.now();
      try {
        results.push(await this.dispatchUnit(unit, params, session, undefined, results));
      } catch (e: unknown) {
        results.push({ unit, status: "failed", data: null, method: "none", error: e instanceof Error ? e.message : String(e), responseTime: Date.now() - start });
      }
    }
    return results;
  }
}
