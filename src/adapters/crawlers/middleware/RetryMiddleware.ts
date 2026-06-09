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
            // 仅对不在 RATE_LIMIT_CODES 中的 code 触发暂停
            // （RATE_LIMIT_CODES 中的 code 由各个爬虫的 handler 自行处理重试和密钥刷新）
            this.logger.warn(
              `⚠️ [${ctx.site}] 触发风控 code=${body.code}${attempt < this.maxRetries ? `，等待 ${this.retryDelay}ms 重试...` : "，已耗尽重试次数"}`,
            );
            if (body.code === 300011 && ctx.site === "xiaohongshu") {
              this.logger.warn("⚠️ 小红书风控已触发，建议：1) 降低请求频率 2) 更换爬虫专用小号 3) 等待冷却后重试");
            }
            this.rateLimiter?.onRateLimitError?.(body.code, ctx.url ? new URL(ctx.url).pathname : ctx.url);
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
