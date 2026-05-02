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
import { getBrowser } from "../../utils/BrowserPool";

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
      const { context } = await getBrowser(siteKey);
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
}
