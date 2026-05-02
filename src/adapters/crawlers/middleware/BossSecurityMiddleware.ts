import { ICrawlMiddleware, CrawlContext, CrawlResult } from "../../../core/ports/ICrawlMiddleware";
import { SiteRateLimiter } from "../../../utils/rate-limiter";
import { ZpTokenManager } from "../../../utils/crypto/boss-zp-token";
import { getBossToken } from "../../../utils/backend-client";
import { FeatureFlags } from "../../../core/features";

/**
 * BOSS 直聘安全中间件。
 * 通过 ZpTokenManager（本地）或后端服务（远程）获取实时 Cookie、__zp_stoken__ 和 traceid。
 */
export class BossSecurityMiddleware implements ICrawlMiddleware {
  readonly name = "BossSecurity";

  constructor(
    private rateLimiter: SiteRateLimiter,
    private tokenManager: ZpTokenManager,
  ) {}

  async process(ctx: CrawlContext, next: () => Promise<CrawlResult>): Promise<CrawlResult> {
    let stoken: string;
    let traceid: string;
    let cookies: Record<string, string>;

    if (FeatureFlags.enableBackendService) {
      const token = await getBossToken();
      stoken = token.stoken;
      traceid = token.traceid;
      cookies = token.cookies;
    } else {
      await this.tokenManager.waitReady(60000);
      stoken = this.tokenManager.stoken;
      traceid = this.tokenManager.traceid;
      cookies = this.tokenManager.cookies;
    }

    const cookieParts: string[] = [];
    for (const [k, v] of Object.entries(cookies)) {
      cookieParts.push(`${k}=${v}`);
    }
    if (stoken && !Object.prototype.hasOwnProperty.call(cookies, "__zp_stoken__")) {
      cookieParts.push(`__zp_stoken__=${stoken}`);
    }
    if (cookieParts.length > 0) {
      ctx.headers["Cookie"] = cookieParts.join("; ");
    }

    if (traceid) ctx.headers["traceid"] = traceid;

    ctx.headers["x-requested-with"] = "XMLHttpRequest";
    ctx.headers["Origin"] = "https://www.zhipin.com";
    ctx.headers["Referer"] = "https://www.zhipin.com/web/geek/jobs";
    ctx.headers["Accept"] = "application/json, text/plain, */*";

    await this.rateLimiter.throttle();
    return next();
  }
}
