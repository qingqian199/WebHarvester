import { ICrawlMiddleware, CrawlContext, CrawlResult } from "../../../core/ports/ICrawlMiddleware";
import { hasBrowserSignature, signWithBrowser } from "../../../utils/crypto/browser-signature-service";

/**
 * 浏览器签名中间件。
 * 如果当前站点注册了浏览器签名服务，在请求发送前调用服务生成签名头。
 * 服务不可用或超时 → 静默降级（不阻塞请求）。
 */
export class BrowserSignatureMiddleware implements ICrawlMiddleware {
  readonly name = "BrowserSignature";

  async process(ctx: CrawlContext, next: () => Promise<CrawlResult>): Promise<CrawlResult> {
    if (!hasBrowserSignature(ctx.site)) return next();

    try {
      const cookieStr = (ctx.session?.cookies ?? []).map((c: { name: string; value: string }) => `${c.name}=${c.value}`).join("; ");
      const signHeaders = await signWithBrowser(ctx.site, ctx.url, ctx.headers, ctx.body, cookieStr);
      Object.assign(ctx.headers, signHeaders);
      if (signHeaders["X-Bogus"]) ctx.locals._signedWithBrowser = true;
    } catch {
      // 服务不可用 → 静默降级
    }

    return next();
  }
}
