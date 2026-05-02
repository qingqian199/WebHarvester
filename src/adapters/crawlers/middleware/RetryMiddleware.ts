import { ICrawlMiddleware, CrawlContext, CrawlResult } from "../../../core/ports/ICrawlMiddleware";
import { RATE_LIMIT_CODES } from "../../../utils/rate-limiter";
import { SiteRateLimiter } from "../../../utils/rate-limiter";
import { ConsoleLogger } from "../../ConsoleLogger";

export class RetryMiddleware implements ICrawlMiddleware {
  readonly name = "Retry";
  private logger = new ConsoleLogger("warn");

  constructor(
    private rateLimiter: SiteRateLimiter,
    private maxRetries = 1,
    private retryDelay = 3000,
  ) {}

  async process(ctx: CrawlContext, next: () => Promise<CrawlResult>): Promise<CrawlResult> {
    const rlCodes = RATE_LIMIT_CODES[ctx.site] || [];

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      ctx.retryCount = attempt;
      const result = await next();
      let isRateLimited = false;

      if (rlCodes.length > 0) {
        try {
          const body = JSON.parse(result.body);
          if (rlCodes.includes(body.code)) {
            isRateLimited = true;
            const endpoint = ctx.url ? new URL(ctx.url).pathname : undefined;
            this.rateLimiter.onRateLimitError(body.code, endpoint);
            this.logger.warn(`⚠️ [${ctx.site}] 触发风控 code=${body.code}${attempt < this.maxRetries ? `，等待 ${this.retryDelay}ms 重试...` : "，已耗尽重试次数"}`);
            if (attempt < this.maxRetries) {
              await new Promise((r) => setTimeout(r, this.retryDelay));
              continue;
            }
          }
        } catch {}
      }
      if (!isRateLimited) return result;
    }
    throw new Error(`[${ctx.site}] 重试耗尽，所有请求均触发风控`);
  }
}
