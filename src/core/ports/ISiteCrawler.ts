/** 会话数据，用于特化爬虫注入登录态。 */
export interface CrawlerSession {
  cookies: Array<{ name: string; value: string; domain?: string }>;
  localStorage?: Record<string, string>;
}

/** 特化爬虫返回的结构化页面数据。 */
export interface PageData {
  url: string;
  statusCode: number;
  body: string;
  headers: Record<string, string>;
  /** 请求耗时（毫秒） */
  responseTime: number;
  capturedAt: string;
}

/**
 * 特化站点爬虫端口。
 * 实现此接口的爬虫直接构造带签名的 HTTP 请求，绕过反爬。
 * 适用于小红书、知乎等已知签名算法的站点。
 */
/** 特化爬虫请求选项。 */
export interface FetchOptions {
  /** HTTP 方法，默认 GET。 */
  method?: string;
  /** 请求体（仅 POST/PUT 时需要）。 */
  body?: string;
  /** 内容类型，默认自动。 */
  contentType?: string;
}

export interface ISiteCrawler {
  /** 爬虫名称，用于日志和配置标识。 */
  readonly name: string;
  /** 匹配域名，如 "xiaohongshu.com"。 */
  readonly domain: string;

  /** 判断当前 URL 是否由该爬虫处理。 */
  matches(url: string): boolean;

  /**
   * 执行带签名的请求采集。
   * @param url 目标 URL。
   * @param session 可选登录态（cookies）。
   * @param options 可选请求选项（method、body 等）。
   */
  fetch(url: string, session?: CrawlerSession, options?: FetchOptions): Promise<PageData>;
}
