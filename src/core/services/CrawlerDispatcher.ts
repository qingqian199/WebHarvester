import { ISiteCrawler, CrawlerSession, PageData } from "../ports/ISiteCrawler";

/**
 * 爬虫调度器。
 * 维护特化爬虫注册表，根据 URL 分发到对应的特化爬虫。
 * 无匹配时返回 null，调用方回退到通用引擎。
 */
export class CrawlerDispatcher {
  private readonly crawlers: ISiteCrawler[] = [];

  /** 注册一个特化爬虫。先注册的先匹配。 */
  register(crawler: ISiteCrawler): void {
    this.crawlers.push(crawler);
  }

  /** 取消注册所有爬虫（用于测试重置）。 */
  clear(): void {
    this.crawlers.length = 0;
  }

  /** 获取已注册爬虫列表（只读）。 */
  get list(): readonly ISiteCrawler[] {
    return this.crawlers;
  }

  /**
   * 根据 URL 调度到匹配的爬虫。
   * @returns 匹配的爬虫，无匹配返回 null。
   */
  dispatch(url: string): ISiteCrawler | null {
    for (const c of this.crawlers) {
      if (c.matches(url)) return c;
    }
    return null;
  }

  /**
   * 执行采集。优先走特化爬虫，无匹配返回 null。
   * @returns PageData 如果命中爬虫，否则 null。
   */
  async fetch(url: string, session?: CrawlerSession): Promise<PageData | null> {
    const crawler = this.dispatch(url);
    if (!crawler) return null;
    return crawler.fetch(url, session);
  }
}
