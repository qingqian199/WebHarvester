import fetch from "node-fetch";
import { ISiteCrawler, CrawlerSession, PageData, FetchOptions } from "../../core/ports/ISiteCrawler";
import { CrawlContext } from "../../core/ports/ICrawlMiddleware";
import { IProxyProvider } from "../../core/ports/IProxyProvider";
import { RealisticFingerprintProvider } from "../RealisticFingerprintProvider";
import { PlaywrightAdapter } from "../PlaywrightAdapter";
import { ConsoleLogger } from "../ConsoleLogger";
import { getRateLimiter, RATE_LIMIT_CODES, RISK_LEVELS } from "../../utils/rate-limiter";
import { SiteRateLimiter } from "../../utils/rate-limiter";
import { validateUrl } from "../../utils/url-validator";
import { formatError } from "../../core/error/error-registry";
import { BizError } from "../../core/error/BizError";
import { ErrorCode } from "../../core/error/ErrorCode";
import { getSharedHttpAgentForUrl, getProxiedAgent } from "../../utils/shared-http-agent";
import { UnitResult } from "../../core/models/ContentUnit";
import { MiddlewarePipeline } from "./MiddlewarePipeline";
import { FingerprintMiddleware, RateLimitMiddleware, BodyTruncationMiddleware, RetryMiddleware, BrowserSignatureMiddleware } from "./middleware";
import { getBrowser as getProviderBrowser } from "../../services/BrowserProvider";
import { FeatureFlags } from "../../core/features";

export interface SubReplyFetchResult {
  replies: unknown[];
  hasMore: boolean;
  nextCursor: string | number;
  responseTime: number;
}

export interface SubReplyTraverseOptions {
  rootIdExtractor: (item: unknown) => string | number;
  fetchPage: (rootId: string | number, cursor: string | number) => Promise<SubReplyFetchResult>;
  maxPages?: number;
  concurrency?: number;
  staggerMs?: number;
  postProcess?: (replies: unknown[], rootId: string | number) => { replies: unknown[]; additional?: Record<string, unknown> };
}

export interface SubReplyResult {
  byRpid: Record<string, { replies: unknown[]; all_count: number }>;
  totalReplies: number;
  expandedCount: number;
  totalTime: number;
  failedCount: number;
}

export abstract class BaseCrawler implements ISiteCrawler {
  abstract readonly name: string;
  abstract readonly domain: string;
  protected readonly fp = new RealisticFingerprintProvider();
  protected rateLimiter!: SiteRateLimiter;
  protected readonly pipeline = new MiddlewarePipeline();
  protected proxyProvider?: IProxyProvider;
  protected readonly logger = new ConsoleLogger("info");

  constructor(siteName?: string, proxyProvider?: IProxyProvider) {
    if (siteName) {
      this.rateLimiter = getRateLimiter(siteName);
      this.buildDefaultPipeline();
    }
    this.proxyProvider = proxyProvider;
  }

  /** 建立默认中间件链（与原有硬编码逻辑等价）。子类可重写或追加。 */
  protected buildDefaultPipeline(): void {
    this.pipeline.clear();
    this.pipeline.use(new FingerprintMiddleware((url) => this.getReferer(url)));
    this.pipeline.use(new RateLimitMiddleware(this.rateLimiter));
    this.pipeline.use(new BrowserSignatureMiddleware());
    this.pipeline.use(new RetryMiddleware(this.rateLimiter));
    this.pipeline.use(new BodyTruncationMiddleware(200000));
  }

  /** 子类可注册额外中间件。 */
  protected registerMiddleware(mw: import("../../core/ports/ICrawlMiddleware").ICrawlMiddleware): void {
    this.pipeline.use(mw);
  }

  abstract matches(url: string): boolean;

  /** 子类可在此注入站点特有的签名头（X-s、x-zse-96、wbi 等）。 */
  protected addAuthHeaders(_headers: Record<string, string>, _url: string, _method: string, _body: string, _session?: CrawlerSession): void | Promise<void> {}

  /** 子类可自定义 Referer，默认使用当前 URL 的 origin。 */
  protected getReferer(url: string): string {
    try { return new URL(url).origin + "/"; } catch { return "https://www." + this.domain + "/"; }
  }

  async fetch(url: string, session?: CrawlerSession, options?: FetchOptions): Promise<PageData> {
    validateUrl(url);
    const method = options?.method ?? "GET";
    const reqBody = options?.body ?? "";

    const ctx: CrawlContext = {
      url,
      method,
      headers: {},
      body: reqBody,
      session,
      site: this.name,
      retryCount: 0,
      locals: {},
    };

    // 子类签名钩子
    await this.addAuthHeaders(ctx.headers, url, method, reqBody, session);

    if (method === "POST" && reqBody) {
      ctx.headers["Content-Type"] = options?.contentType ?? "application/json;charset=UTF-8";
    }

    const start = Date.now();

    const proxy = this.proxyProvider?.enabled ? await this.proxyProvider.getProxy(this.name) : null;
    const agent = proxy ? getProxiedAgent(ctx.url, proxy) : getSharedHttpAgentForUrl(ctx.url);

    const result = await this.pipeline.execute(ctx, async (c: CrawlContext) => {
      try {
        const res = await fetch(c.url, {
          method: c.method,
          headers: c.headers,
          agent,
          ...(c.method === "POST" && c.body ? { body: c.body } : {}),
        });
        const responseTime = Date.now() - start;

        if (this.rateLimiter) {
          const success = res.status >= 200 && res.status < 500;
          this.rateLimiter.recordResult(success);
        }

        return {
          statusCode: res.status,
          body: await res.text(),
          headers: Object.fromEntries(res.headers),
          responseTime,
        };
      } catch (err) {
        const detailMsg = c.url ? c.url : undefined;
        const msg = formatError("E105", detailMsg);
        this.logger.warn(msg);
        throw new BizError("E105" as ErrorCode, `${msg}\n原始错误: ${(err as Error).message}`);
      }
    });

    return {
      url: result.statusCode === 200 ? url : url,
      statusCode: result.statusCode,
      body: result.body,
      headers: result.headers,
      responseTime: result.responseTime,
      capturedAt: new Date().toISOString(),
    };
  }

  /** 带风控感知重试的 fetch（通过 RetryMiddleware 实现）。在风控码捕获后调用 onRateLimitError。 */
  protected async fetchWithRetry(url: string, session?: CrawlerSession, options?: FetchOptions): Promise<PageData> {
    const result = await this.fetch(url, session, options);
    if (this.rateLimiter) {
      const code = result.statusCode;
      const endpoint = url ? new URL(url).pathname : undefined;

      if (code === 403 || code === 429) {
        this.rateLimiter.onRateLimitError(code, endpoint);
      }

      try {
        const body = JSON.parse(result.body);
        if (body.code != null) {
          const knownCodes = RATE_LIMIT_CODES[this.name] || [];
          if (!knownCodes.includes(body.code)) {
            const entry = RISK_LEVELS[String(body.code)];
            if (entry) {
              this.rateLimiter.onRateLimitError(body.code, endpoint);
            }
          }
        }
      } catch {}
    }

    return result;
  }

  /** Playwright 页面数据提取的公共流程。使用了 BrowserPool 复用浏览器实例。 */
  /** 子类可重写以将 API 请求 URL 映射为页面 URL（用于风控降级时打开用户页面提取 SSR 数据）。 */
  protected getPageUrlForApi(apiUrl: string): string {
    return apiUrl;
  }

  /** 从 JSON 响应体中提取已知风控码。返回第一个匹配的 code，无匹配返回 null。 */
  protected extractErrorCodeFromBody(body: string, knownCodes: number[]): number | null {
    try {
      const parsed = JSON.parse(body);
      if (parsed != null && typeof parsed === "object") {
        const code = parsed.code ?? parsed.status_code ?? parsed.errcode;
        if (typeof code === "number" && code !== 0 && (knownCodes.includes(code) || RISK_LEVELS[String(code)])) return code;
      }
    } catch {}
    return null;
  }

  /** 浏览器降级：打开页面，提取 SSR 数据，包装为 API 兼容格式。 */
  private async tryBrowserFallback(url: string, session?: CrawlerSession, errorCode?: number): Promise<PageData | null> {
    const start = Date.now();
    try {
      const cdpReady = await this.quickCdpCheck();
      if (!cdpReady) { this.logger.warn("ChromeService CDP 不可用，跳过浏览器降级"); return null; }
      const pageUrl = this.getPageUrlForApi(url);
      const { browser } = await this.fetchPageContent(pageUrl, session, this.domain);
      try {
        const { body } = await this.extractSSRData(browser, "Signature", errorCode);
        const elapsed = Date.now() - start;
        this.logger.info(`✅ 浏览器降级请求成功 (耗时: ${elapsed}ms)`);
        return { url, statusCode: 200, body, headers: { "content-type": "application/json;charset=utf-8" }, responseTime: elapsed, capturedAt: new Date().toISOString() };
      } finally { await browser.close(); }
    } catch (browserErr) {
      this.logger.error(`❌ 浏览器降级请求也失败: ${(browserErr as Error).message}，放弃降级`);
      return null;
    }
  }

  /** 提取 SSR 数据：依次尝试 __INITIAL_STATE__ / __NEXT_DATA__ / __NUXT_DATA__。 */
  protected async extractSSRData(browser: PlaywrightAdapter, degradedFrom = "Signature", errorCode?: number): Promise<{ body: string }> {
    const b = browser as any;
    const ssrData: string = await b.executeScript(`(() => {
      const r = {}; const is = window.__INITIAL_STATE__;
      if (is) { r._hasInitState = true; r.data = JSON.parse(JSON.stringify(is)); }
      const nd = document.getElementById("__NEXT_DATA__");
      if (nd) { r._hasNextData = true; try { r.nextData = JSON.parse(nd.textContent || "{}"); } catch {} }
      const nu = document.getElementById("__NUXT_DATA__");
      if (nu) { r._hasNuxtData = true; try { r.nuxtData = JSON.parse(nu.textContent || "{}"); } catch {} }
      r.title = document.title; return JSON.stringify(r);
    })()`).catch(() => "{}");
    const parsed = JSON.parse(ssrData);
    if (parsed._hasInitState || parsed._hasNextData || parsed._hasNuxtData) {
      const apiCompat: Record<string, unknown> = { code: 0, _degraded: true, _degradedFrom: degradedFrom };
      if (errorCode != null) apiCompat._degradedCode = errorCode;
      if (parsed.data) apiCompat.data = parsed.data;
      else if (parsed.nextData) apiCompat.data = parsed.nextData.props?.pageProps || parsed.nextData;
      else if (parsed.nuxtData) apiCompat.data = parsed.nuxtData;
      return { body: JSON.stringify(apiCompat) };
    }
    const title = parsed.title || "";
    const bodyText: string = await b.executeScript("document.body.innerText.slice(0, 10000)").catch(() => "");
    return { body: JSON.stringify({ code: 0, _degraded: true, _degradedFrom: degradedFrom, title, content: bodyText, _degradedCode: errorCode }) };
  }

  /** ChromeService CDP 连接端口，由 index.ts 启动时设置。 */
  static chromeServicePort = 9222;

  /**
   * 统一 Fetch 策略：按优先级依次尝试不同数据源。
   *
   * 支持三种策略模式：
   * - "api"：HTTP API 直连（fetch/fetchWithRetry）
   * - "browser"：浏览器页面提取
   * - "auto"：先 API，API 失败后自动降级到浏览器
   *
   * @param type 数据源类型标识（仅用于日志）
   * @param apiFn API 调用函数（返回 code=0 表示成功）
   * @param pageFn 浏览器提取函数
   * @param strategy 策略模式（默认 "auto"）
   */
  protected async fetchStrategy<T>(
    type: string,
    apiFn: () => Promise<{ code: number; data?: T } | null>,
    pageFn: () => Promise<{ data?: T; responseTime: number }>,
    strategy: "api" | "browser" | "auto" = "auto",
  ): Promise<{ data: T | null; method: string; responseTime: number; error?: string }> {
    if (strategy === "browser") {
      const result = await pageFn();
      return { data: result.data ?? null, method: "html_extract", responseTime: result.responseTime };
    }

    // API 直连
    if (strategy === "api" || strategy === "auto") {
      try {
        const result = await apiFn();
        if (result && result.code === 0 && result.data) {
          return { data: result.data, method: "signature", responseTime: 0 };
        }
      } catch {}
    }

    if (strategy === "api") {
      return { data: null, method: "signature", responseTime: 0, error: `${type} API 返回异常` };
    }

    // auto 模式降级到浏览器
    const result = await pageFn();
    return {
      data: result.data ?? null,
      method: "html_extract",
      responseTime: result.responseTime,
      error: `${type} API 不可用，降级到页面提取`,
    };
  }

  /** 快速检查 ChromeService CDP 是否可用。 */
  private async quickCdpCheck(): Promise<boolean> {
    if (!FeatureFlags.enableChromeService) return false;
    const { get } = await import("http");
    return new Promise((resolve) => {
      const req = get(`http://127.0.0.1:${BaseCrawler.chromeServicePort}/json/version`, (res) => {
        resolve(res.statusCode === 200);
      });
      req.on("error", () => {
        this.logger.warn("ChromeService CDP 不可用 (端口 9222 无响应)，跳过浏览器降级。");
        resolve(false);
      });
      req.setTimeout(2000, () => { req.destroy(); resolve(false); });
    });
  }

  protected async fetchPageContent(
    url: string,
    session?: CrawlerSession,
    domain?: string,
    contentSelector?: string,
    pageSetup?: (page: any) => Promise<void>,
  ): Promise<{ browser: PlaywrightAdapter; startTime: number }> {
    validateUrl(url);
    const adapter = new PlaywrightAdapter(this.logger);
    const startTime = Date.now();
    const siteKey = domain || this.domain;

    try {
      const { context } = await getProviderBrowser(siteKey);
      const sessionState = session ? {
        cookies: session.cookies.map((c) => ({
          name: c.name, value: c.value, domain: c.domain ?? `.${siteKey}`,
          path: "/", httpOnly: false, secure: false, sameSite: "Lax" as const,
        })),
        localStorage: session.localStorage ?? {},
        sessionStorage: {},
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
      } : undefined;

      await (adapter as any).attachToContext(context, url, sessionState, pageSetup, siteKey);
    } catch (e) {
      const warnMsg = formatError("E201", url);
      this.logger.warn(warnMsg);
      this.logger.warn("浏览器池获取失败，回退到直接启动", { err: (e as Error).message });
      const proxyCfg = this.proxyProvider?.enabled ? await this.proxyProvider.getProxy(this.name) : null;
      const proxyUrl = proxyCfg ? `${proxyCfg.protocol}://${proxyCfg.host}:${proxyCfg.port}` : undefined;
      await adapter.launch(url, session ? {
        cookies: session.cookies.map((c) => ({
          name: c.name, value: c.value, domain: c.domain ?? `.${siteKey}`,
          path: "/", httpOnly: false, secure: false, sameSite: "Lax" as const,
        })),
        localStorage: session.localStorage ?? {},
        sessionStorage: {},
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
      } : undefined, proxyUrl, pageSetup as any);
    }

    if (contentSelector) {
      try {
        await (adapter as any).lcm.getPage().waitForSelector(contentSelector, { timeout: 8000 });
      } catch {}
    } else {
      await new Promise((r) => setTimeout(r, 2000));
    }

    return { browser: adapter, startTime };
  }

  /** 去重评论数组。去重键: rpid + content + author.name。返回 { data, deduped_count }。 */
  protected dedupComments<T extends { rpid?: number | string; content?: any; member?: any }>(items: T[]): { data: T[]; deduped_count: number } {
    const seen = new Set<string>();
    const data: T[] = [];
    let deduped_count = 0;
    for (const item of items) {
      const key = `${item.rpid}_${item.content?.message || item.content}_${item.member?.uname || ""}`;
      if (seen.has(key)) { deduped_count++; continue; }
      seen.add(key);
      data.push(item);
    }
    return { data, deduped_count };
  }

  /** 统一时间戳 → ISO 8601。输入: Unix 秒或毫秒。 */
  protected fmtTime(ts: number | undefined | null): string | undefined {
    if (ts == null) return undefined;
    const d = new Date(ts < 1e12 ? ts * 1000 : ts);
    return isNaN(d.getTime()) ? undefined : d.toISOString();
  }

  /** 安全数值转换。 */
  protected safeNum(val: unknown, def = 0): number {
    const n = Number(val);
    return isNaN(n) ? def : n;
  }

  /** 并发限制器：同时最多 n 个任务运行。 */
  protected async runWithConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
    const results: R[] = [];
    const running = new Set<Promise<void>>();
    for (const item of items) {
      const p = fn(item).then((r) => { results.push(r); });
      running.add(p);
      const cleanup = () => running.delete(p);
      p.then(cleanup, cleanup);
      if (running.size >= concurrency) await Promise.race(running);
    }
    await Promise.all(running);
    return results;
  }

  /** 并发执行无依赖的内容单元，带 200ms 错峰避免同时请求。 */
  protected async runUnitsParallel<T>(
    units: string[],
    fn: (unit: string) => Promise<UnitResult<T>>,
    dependentUnits: string[],
  ): Promise<UnitResult<T>[]> {
    const results: UnitResult<T>[] = [];
    const independent = units.filter((u) => !dependentUnits.includes(u));
    const dependent = units.filter((u) => dependentUnits.includes(u) && units.includes(u));
    if (independent.length > 0) {
      const indResults = await Promise.all(independent.map((u, i) => new Promise<UnitResult<T>>((resolve) => setTimeout(resolve, i * 200)).then(() => fn(u).catch((e) => ({ unit: u, status: "failed" as const, data: null as T, method: "none", error: e.message, responseTime: 0 })))));
      results.push(...indResults);
    }
    for (const u of dependent) {
      results.push(await fn(u));
    }
    return results;
  }

  protected pageDataFromBrowser(browser: PlaywrightAdapter, url: string, startTime: number, body: string): Promise<PageData> {
    return Promise.resolve({
      url,
      statusCode: 200,
      body,
      headers: { "content-type": "application/json;charset=utf-8" },
      responseTime: Date.now() - startTime,
      capturedAt: new Date().toISOString(),
    });
  }

  /** 策略映射表，子类在构造器中注册处理函数。 */
  protected unitHandlers: Map<string, (unit: string, params: Record<string, string>, session?: CrawlerSession, authMode?: string, results?: UnitResult[]) => Promise<UnitResult>> = new Map();

  /** 从策略映射中查找并执行处理函数，未找到返回 failed。 */
  protected async dispatchUnit(unit: string, params: Record<string, string>, session?: CrawlerSession, authMode?: string, results?: UnitResult[]): Promise<UnitResult> {
    const handler = this.unitHandlers.get(unit);
    if (!handler) return { unit, status: "failed" as const, data: null, method: "none" as const, error: `未知内容单元: ${unit}`, responseTime: 0 };
    return handler(unit, params, session, authMode, results);
  }

  protected shuffleArray<T>(arr: T[]): T[] {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * 通用子回复遍历。
   * 收集 rootItems 中所有 rootId → 并发请求子回复 API → 翻页 → 按 rootId 分组。
   */
  protected async traverseSubReplies<T>(rootItems: T[], options: SubReplyTraverseOptions): Promise<SubReplyResult> {
    const maxPages = options.maxPages ?? 5;
    const concurrency = options.concurrency ?? 3;
    const staggerMs = options.staggerMs ?? 500;
    const rpids = rootItems.map((r) => String(options.rootIdExtractor(r))).filter(Boolean);
    if (rpids.length === 0) return { byRpid: {}, totalReplies: 0, expandedCount: 0, totalTime: 0, failedCount: 0 };
    const target = rpids.slice(0, 100);
    type RpidResult = { rootId: string; replies: unknown[]; all_count: number; subReplyTime: number };
    const rpidResults: (RpidResult | null)[] = await this.runWithConcurrency(target, concurrency, async (rootId: string): Promise<RpidResult | null> => {
      try {
        await new Promise((r) => setTimeout(r, staggerMs));
        let allReplies: unknown[] = [];
        let totalTime = 0;
        let cursor: string | number = 0;
        for (let p = 0; p < maxPages; p++) {
          const result = await options.fetchPage(rootId, cursor);
          totalTime += result.responseTime;
          if (result.replies.length > 0) { allReplies = allReplies.concat(result.replies); if (!result.hasMore) break; cursor = result.nextCursor; } else break;
        }
        let processedReplies = allReplies;
        if (options.postProcess) { const pp = options.postProcess(processedReplies, rootId); processedReplies = pp.replies; }
        return { rootId, replies: processedReplies, all_count: processedReplies.length, subReplyTime: totalTime };
      } catch (e: unknown) { this.logger.warn(`子回复遍历失败 (rootId=${rootId}): ${e instanceof Error ? e.message : String(e)}`); return null; }
    });
    const byRpid: Record<string, { replies: unknown[]; all_count: number }> = {};
    let totalReplies = 0, expandedCount = 0, totalTime = 0, failedCount = 0;
    for (const rr of rpidResults) {
      if (!rr) { failedCount++; continue; }
      if (rr.all_count > 0) { byRpid[rr.rootId] = { replies: rr.replies, all_count: rr.all_count }; totalReplies += rr.all_count; expandedCount++; }
      totalTime += rr.subReplyTime;
    }
    return { byRpid, totalReplies, expandedCount, totalTime, failedCount };
  }
}
