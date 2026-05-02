import { ICrawlMiddleware, CrawlContext, CrawlResult } from "../../../core/ports/ICrawlMiddleware";
import { SiteRateLimiter } from "../../../utils/rate-limiter";
import { ConsoleLogger } from "../../ConsoleLogger";

export class RateLimitMiddleware implements ICrawlMiddleware {
  readonly name = "RateLimit";
  private logger = new ConsoleLogger("warn");

  constructor(private rateLimiter: SiteRateLimiter) {}

  async process(ctx: CrawlContext, next: () => Promise<CrawlResult>): Promise<CrawlResult> {
    const isPaused = this.rateLimiter.isPaused;
    if (isPaused) {
      this.logger.warn(`⏸️ [${ctx.site}] 站点冷却中，使用页面提取兜底`);
    }
    await this.rateLimiter.throttle();
    return next();
  }
}
