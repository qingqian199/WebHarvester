import { CrawlerSession, PageData } from "../../core/ports/ISiteCrawler";
import { IProxyProvider } from "../../core/ports/IProxyProvider";
import { UnitResult } from "../../core/models/ContentUnit";
import { getRateLimiter } from "../../utils/rate-limiter";
import { BaseCrawler } from "./BaseCrawler";
import { ZpTokenManager } from "../../utils/crypto/boss-zp-token";
import { BossSecurityMiddleware } from "./middleware/BossSecurityMiddleware";
import { RateLimitMiddleware } from "./middleware/RateLimitMiddleware";
import { BodyTruncationMiddleware } from "./middleware/BodyTruncationMiddleware";
import { getBossToken } from "../../utils/backend-client";
import { FeatureFlags } from "../../core/features";

const BOSS_DOMAIN = "zhipin.com";
const BOSS_API_HOST = "www.zhipin.com";

export interface BossEndpointDef {
  name: string;
  path: string;
  method?: string;
  params?: string;
  status?: "verified" | "sig_pending";
  /** 是否强制要求使用代理（true = 无可用代理时直接失败） */
  proxyRequired?: boolean;
}

export const BossApiEndpoints: ReadonlyArray<BossEndpointDef> = [
  { name: "城市列表", path: "/wapi/zpCommon/data/cityGroup.json", status: "verified" },
  { name: "城市站点", path: "/wapi/zpgeek/common/data/city/site.json", status: "verified" },
  { name: "默认城市", path: "/wapi/zpgeek/common/data/defaultcity.json", status: "verified" },
  { name: "职类筛选条件", path: "/wapi/zpgeek/pc/all/filter/conditions.json", status: "verified" },
  { name: "行业过滤列表", path: "/wapi/zpCommon/data/industryFilterExemption", status: "verified" },
  { name: "页面头部", path: "/wapi/zpgeek/common/data/header.json", status: "verified" },
  { name: "页面底部", path: "/wapi/zpgeek/common/data/footer.json", status: "verified" },
  { name: "Banner查询", path: "/wapi/zpgeek/webtopbanner/query.json", status: "verified" },

  // 🔒 搜索类接口 — IP 风控敏感，需通过代理访问
  { name: "搜索职位", path: "/wapi/zpgeek/search/joblist.json", params: "query={keyword}&page={page}&city={city}", status: "verified", proxyRequired: true },
  { name: "职位详情", path: "/wapi/zpgeek/search/detail.json", params: "jobId={jobId}", status: "verified", proxyRequired: true },
  { name: "公司信息", path: "/wapi/zpgeek/search/geek.json", params: "jobId={jobId}", status: "verified", proxyRequired: true },
  { name: "安全引导", path: "/wapi/zpuser/wap/getSecurityGuideV1", status: "verified" },
];

export class BossZhipinCrawler extends BaseCrawler {
  readonly name = "boss_zhipin";
  readonly domain = BOSS_DOMAIN;
  readonly tokenManager = new ZpTokenManager();

  constructor(proxyProvider?: IProxyProvider) {
    super("boss_zhipin", proxyProvider);
    this.rateLimiter = getRateLimiter("boss_zhipin", {
      enabled: true,
      minDelay: 3000,
      maxDelay: 6000,
      cooldownMinutes: 15,
      maxConcurrentSignatures: 1,
      maxConcurrentPages: 1,
    });
    this.buildBossPipeline();

    if (!FeatureFlags.enableBackendService) {
      this.tokenManager.start().catch((e) =>
        this.logger.warn("BOSS 令牌服务启动失败", { err: (e as Error).message }),
      );
    }
  }

  private buildBossPipeline(): void {
    this.pipeline.clear();
    this.pipeline.use(new BossSecurityMiddleware(this.rateLimiter, this.tokenManager));
    this.pipeline.use(new RateLimitMiddleware(this.rateLimiter));
    this.pipeline.use(new BodyTruncationMiddleware(200000));
  }

  matches(url: string): boolean {
    try {
      return new URL(url).hostname.includes(BOSS_DOMAIN);
    } catch {
      return false;
    }
  }

  protected getReferer(_url: string): string {
    return "https://www.zhipin.com/web/geek/jobs";
  }

  protected async addAuthHeaders(headers: Record<string, string>, _url: string, _method: string, _body: string, _session?: CrawlerSession): Promise<void> {
    headers["x-requested-with"] = "XMLHttpRequest";
    headers["Origin"] = "https://www.zhipin.com";
    headers["Referer"] = "https://www.zhipin.com/web/geek/jobs";
    headers["Accept"] = "application/json, text/plain, */*";

    if (FeatureFlags.enableBackendService) {
      try {
        const token = await getBossToken();
        if (token.traceid) headers["traceid"] = token.traceid;
      } catch {}
    } else {
      if (this.tokenManager.traceid) headers["traceid"] = this.tokenManager.traceid;
    }
  }

  async fetchApi(
    endpointName: string,
    params?: Record<string, string>,
    session?: CrawlerSession,
  ): Promise<PageData> {
    if (!FeatureFlags.enableBackendService) {
      await this.tokenManager.waitReady();
    }

    const ep = BossApiEndpoints.find((e) => e.name === endpointName);
    if (!ep) throw new Error(`未知端点: ${endpointName}`);

    if (ep.proxyRequired && (!this.proxyProvider || !this.proxyProvider.enabled)) {
      throw new Error("搜索接口需要代理访问。请在 config.json 中启用 proxyPool 并配置代理");
    }

    let query = ep.params || "";
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        query = query.replace(`{${k}}`, encodeURIComponent(v));
      }
    }

    const url = `https://${BOSS_API_HOST}${ep.path}${query ? "?" + query : ""}`;
    return this.fetchWithRetry(url, session);
  }

  async fetchPageData(pageType: string, params: Record<string, string>, session?: CrawlerSession): Promise<PageData> {
    const pageUrl =
      pageType === "搜索职位"
        ? `https://www.zhipin.com/web/geek/jobs?query=${encodeURIComponent(params.keyword || "")}&city=${encodeURIComponent(params.city || "101010100")}`
        : "https://www.zhipin.com/web/geek/jobs";
    const { browser, startTime } = await this.fetchPageContent(pageUrl, session, ".zhipin.com", ".job-list, .job-card");
    try {
      await new Promise((r) => setTimeout(r, 2000));
      const title = await browser.executeScript<string>("document.title").catch(() => "");
      const bodyText = await browser.executeScript<string>("document.body.innerText.slice(0, 10000)").catch(() => "");
      return {
        url: pageUrl,
        statusCode: 200,
        body: JSON.stringify({ title, content: bodyText }),
        headers: { "content-type": "application/json;charset=utf-8" },
        responseTime: Date.now() - startTime,
        capturedAt: new Date().toISOString(),
      };
    } finally {
      await browser.close();
    }
  }

  async collectUnits(
    units: string[],
    params: Record<string, string>,
    session?: CrawlerSession,
    _authMode?: string,
  ): Promise<UnitResult<unknown>[]> {
    if (!FeatureFlags.enableBackendService) {
      await this.tokenManager.waitReady();
    }
    const results: UnitResult[] = [];

    for (const unit of units) {
      const start = Date.now();
      try {
        switch (unit) {
          case "boss_city_list": {
            const r = await this.fetchApi("城市列表", {}, session);
            const d = JSON.parse(r.body);
            results.push({ unit, status: d.code === 0 ? "success" : "failed", data: d, method: "signature", responseTime: r.responseTime, error: d.code !== 0 ? `业务错误码: ${d.code}` : undefined });
            break;
          }
          case "boss_city_site": {
            const r = await this.fetchApi("城市站点", {}, session);
            const d = JSON.parse(r.body);
            results.push({ unit, status: d.code === 0 ? "success" : "failed", data: d, method: "signature", responseTime: r.responseTime });
            break;
          }
          case "boss_filter_conditions": {
            const r = await this.fetchApi("职类筛选条件", {}, session);
            const d = JSON.parse(r.body);
            results.push({ unit, status: d.code === 0 ? "success" : "failed", data: d, method: "signature", responseTime: r.responseTime });
            break;
          }
          case "boss_industry_filter": {
            const r = await this.fetchApi("行业过滤列表", {}, session);
            const d = JSON.parse(r.body);
            results.push({ unit, status: d.code === 0 ? "success" : "failed", data: d, method: "signature", responseTime: r.responseTime });
            break;
          }
          case "boss_search": {
            const keyword = params.keyword || "";
            const city = params.city || "101010100";
            if (!keyword) { results.push({ unit, status: "failed", data: null, method: "none", error: "缺少 keyword", responseTime: 0 }); break; }
            const r = await this.fetchApi("搜索职位", { keyword, page: params.page || "1", city }, session);
            const d = JSON.parse(r.body);
            if (d.code === 0) {
              results.push({ unit, status: "success", data: d, method: "signature", responseTime: r.responseTime });
            } else if (d.code === 7) {
              results.push({ unit, status: "failed", data: d, method: "signature", responseTime: r.responseTime, error: "登录态失效，需要重新引导会话" });
            } else {
              const fb = await this.fetchPageData("搜索职位", params, session);
              results.push({ unit, status: "partial", data: JSON.parse(fb.body), method: "html_extract", responseTime: fb.responseTime });
            }
            break;
          }
          case "boss_job_detail": {
            const jobId = params.jobId || "";
            if (!jobId) { results.push({ unit, status: "failed", data: null, method: "none", error: "缺少 jobId", responseTime: 0 }); break; }
            const r = await this.fetchApi("职位详情", { jobId }, session);
            const d = JSON.parse(r.body);
            results.push({ unit, status: d.code === 0 ? "success" : "failed", data: d, method: "signature", responseTime: r.responseTime });
            break;
          }
          default:
            results.push({ unit, status: "failed", data: null, method: "none", error: "未知单元", responseTime: 0 });
        }
      } catch (e: unknown) {
        results.push({ unit, status: "failed", data: null, method: "none", error: e instanceof Error ? e.message : String(e), responseTime: Date.now() - start });
      }
    }
    return results;
  }
}
