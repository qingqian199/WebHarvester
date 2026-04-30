import { ILogger } from "../core/ports/ILogger";
import { QuickArticleOptions, ArticleResult } from "../core/ports/IQuickArticleCapture";
import { ISessionManager } from "../core/ports/ISessionManager";
import { PlaywrightAdapter } from "../adapters/PlaywrightAdapter";
import { QuickArticleCaptureAdapter } from "../adapters/QuickArticleCaptureAdapter";

/**
 * 文章采集服务——编排浏览器适配器、适配器和会话复用。
 * 如果提供了 sessionManager 和 profile，会在采集前加载会话供适配器使用。
 */
export class ArticleCaptureService {
  constructor(
    private readonly logger: ILogger,
    private readonly sessionManager?: ISessionManager,
    private readonly profile?: string,
  ) {}

  async capture(url: string, options?: QuickArticleOptions): Promise<ArticleResult> {
    const browser = new PlaywrightAdapter(this.logger);
    const adapter = new QuickArticleCaptureAdapter(browser, this.logger);

    let sessionState = undefined;
    if (this.sessionManager && this.profile) {
      sessionState = await this.sessionManager.load(this.profile) ?? undefined;
      if (sessionState) {
        this.logger.info("检测到已存会话，将注入登录态");
      }
    }

    return adapter.capture(url, { ...options, sessionState });
  }
}
