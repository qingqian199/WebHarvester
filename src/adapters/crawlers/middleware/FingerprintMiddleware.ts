import { ICrawlMiddleware, CrawlContext, CrawlResult } from "../../../core/ports/ICrawlMiddleware";
import { RealisticFingerprintProvider } from "../../RealisticFingerprintProvider";
import { buildBrowserHeaders } from "../../../utils/browser-env";

export class FingerprintMiddleware implements ICrawlMiddleware {
  readonly name = "Fingerprint";
  private readonly fp = new RealisticFingerprintProvider();

  constructor(private getReferer: (url: string) => string = (url) => { try { return new URL(url).origin + "/"; } catch { return ""; } }) {}

  async process(ctx: CrawlContext, next: () => Promise<CrawlResult>): Promise<CrawlResult> {
    const fingerprint = this.fp.getFingerprint();
    const cookieStr = (ctx.session?.cookies ?? []).map((c) => `${c.name}=${c.value}`).join("; ");
    const baseHeaders = buildBrowserHeaders(fingerprint, this.getReferer(ctx.url));
    Object.assign(ctx.headers, baseHeaders);
    if (cookieStr) ctx.headers["Cookie"] = cookieStr;
    if (ctx.method === "POST" && ctx.body) {
      ctx.headers["Content-Type"] = ctx.headers["Content-Type"] || "application/json;charset=UTF-8";
    }
    return next();
  }
}
