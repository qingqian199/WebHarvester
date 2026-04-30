import { IBrowserAdapter } from "../core/ports/IBrowserAdapter";
import { ILogger } from "../core/ports/ILogger";
import { IQuickArticleCapture, QuickArticleOptions, ArticleResult, ArticleAuthor } from "../core/ports/IQuickArticleCapture";

const DEFAULT_CONTENT_SELECTOR = ".RichText";
const DEFAULT_TIMEOUT = 30000;

/** 平台相关选择器映射，可扩展。 */
const PLATFORM_RULES: Record<string, { author?: string; content?: string }> = {
  "zhihu.com": {
    author: ".AuthorInfo-name",
    content: ".RichText",
  },
};

function detectPlatform(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace("www.", "");
    for (const key of Object.keys(PLATFORM_RULES)) {
      if (host.includes(key)) return key;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 快速文章采集适配器。
 * 通过 IBrowserAdapter 和 executeScript 完成 DOM 提取，无需额外依赖。
 */
export class QuickArticleCaptureAdapter implements IQuickArticleCapture {
  constructor(
    private readonly browser: IBrowserAdapter,
    private readonly logger: ILogger,
  ) {}

  async capture(url: string, options?: QuickArticleOptions): Promise<ArticleResult> {
    const selector = this.resolveContentSelector(url, options?.contentSelector);
    const timeout = options?.timeout ?? DEFAULT_TIMEOUT;

    this.logger.info("开始快速文章采集", { url, selector });

    await this.browser.launch(url, options?.sessionState);

    try {
      await this.browser.executeScript<void>(
        `new Promise(r => setTimeout(r, ${Math.min(timeout, 15000)}))`,
      );

      const capturedAt = new Date().toISOString();

      const title = await this.browser.executeScript<string>("document.title");
      const author = await this.extractAuthor(url);
      const content = await this.browser.executeScript<string>(
        `(() => { const el = document.querySelector('${this.escapeCss(selector)}'); return el ? el.innerText.trim() : ''; })()`,
      );
      const contentHtml = await this.browser.executeScript<string>(
        `(() => { const el = document.querySelector('${this.escapeCss(selector)}'); return el ? el.innerHTML.trim() : ''; })()`,
      );
      const performance = this.browser.getPageMetrics() ?? undefined;

      return { title, author, content, contentHtml, capturedAt, performance };
    } finally {
      await this.browser.close();
    }
  }

  private resolveContentSelector(url: string, userSelector?: string): string {
    if (userSelector) return userSelector;
    const platform = detectPlatform(url);
    if (platform && PLATFORM_RULES[platform].content) {
      return PLATFORM_RULES[platform].content!;
    }
    return DEFAULT_CONTENT_SELECTOR;
  }

  private async extractAuthor(url: string): Promise<ArticleAuthor> {
    const platform = detectPlatform(url);
    const authorSelector = platform && PLATFORM_RULES[platform]?.author;

    if (authorSelector) {
      const name = await this.browser.executeScript<string>(
        `(() => { const el = document.querySelector('${this.escapeCss(authorSelector)}'); return el ? el.textContent.trim() : ''; })()`,
      );
      if (name) return { name, url };
    }

    const metaName = await this.browser.executeScript<string>(
      "(() => { const el = document.querySelector('meta[name=\"author\"]'); return el ? el.getAttribute('content') || '' : ''; })()",
    );
    if (metaName) return { name: metaName, url };

    return { name: "未知作者", url: "" };
  }

  private escapeCss(sel: string): string {
    return sel.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  }
}
