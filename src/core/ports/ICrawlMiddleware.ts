import { CrawlerSession } from "./ISiteCrawler";

export interface CrawlContext {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  session?: CrawlerSession;
  site: string;
  retryCount: number;
  /** 子类/中间件可在此存储额外数据。 */
  locals: Record<string, unknown>;
}

export interface CrawlResult {
  statusCode: number;
  body: string;
  headers: Record<string, string>;
  responseTime: number;
}

export interface ICrawlMiddleware {
  readonly name: string;
  process(ctx: CrawlContext, next: () => Promise<CrawlResult>): Promise<CrawlResult>;
}

export type FinalFetchFn = (ctx: CrawlContext) => Promise<CrawlResult>;
