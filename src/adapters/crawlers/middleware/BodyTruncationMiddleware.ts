import { ICrawlMiddleware, CrawlContext, CrawlResult } from "../../../core/ports/ICrawlMiddleware";

export class BodyTruncationMiddleware implements ICrawlMiddleware {
  readonly name = "BodyTruncation";

  constructor(private maxSize = 200000) {}

  async process(ctx: CrawlContext, next: () => Promise<CrawlResult>): Promise<CrawlResult> {
    const result = await next();
    // 不截断 JSON 响应（避免破坏 JSON.parse）
    const ct = (result.headers["content-type"] || result.headers["Content-Type"] || "").toLowerCase();
    if (ct.includes("application/json")) return result;
    // 非 JSON 响应超过上限则截断
    if (result.body.length > this.maxSize) {
      return { ...result, body: result.body.slice(0, this.maxSize) };
    }
    return result;
  }
}
