import { ICrawlMiddleware, CrawlContext, CrawlResult } from "../../../core/ports/ICrawlMiddleware";

export type SigningFn = (url: string, method: string, body: string, headers: Record<string, string>, site: string) => void;

export class SigningMiddleware implements ICrawlMiddleware {
  readonly name = "Signing";

  constructor(private readonly sign: SigningFn) {}

  async process(ctx: CrawlContext, next: () => Promise<CrawlResult>): Promise<CrawlResult> {
    this.sign(ctx.url, ctx.method, ctx.body || "", ctx.headers, ctx.site);
    return next();
  }
}
