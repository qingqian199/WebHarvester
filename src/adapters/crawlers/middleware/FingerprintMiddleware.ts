import { ICrawlMiddleware, CrawlContext, CrawlResult } from "../../../core/ports/ICrawlMiddleware";
import { RealisticFingerprintProvider } from "../../RealisticFingerprintProvider";
import { buildBrowserHeaders } from "../../../utils/browser-env";

export class FingerprintMiddleware implements ICrawlMiddleware {
  readonly name = "Fingerprint";
  private readonly fp = new RealisticFingerprintProvider();

  constructor(
    private getReferer: (url: string) => string = (url) => {
      try {
        return new URL(url).origin + "/";
      } catch {
        return "";
      }
    },
  ) {}

  async process(ctx: CrawlContext, next: () => Promise<CrawlResult>): Promise<CrawlResult> {
    const fingerprint = this.fp.getFingerprint();
    // 只保留与目标域名匹配的 Cookie，避免 header 过大（>8KB 会被 CDN 拒绝）
    const targetDomain = new URL(ctx.url).hostname;
    const cookieStr = (ctx.session?.cookies ?? [])
      .filter((c) => !c.domain || targetDomain.includes(c.domain.replace(/^\./, "")))
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
    const baseHeaders = buildBrowserHeaders(fingerprint, this.getReferer(ctx.url));
    Object.assign(ctx.headers, baseHeaders);
    if (cookieStr) ctx.headers["Cookie"] = cookieStr;
    if (ctx.method === "POST" && ctx.body) {
      ctx.headers["Content-Type"] = ctx.headers["Content-Type"] || "application/json;charset=UTF-8";
    }
    return next();
  }
}
