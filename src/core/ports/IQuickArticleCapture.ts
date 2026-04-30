/** 文章作者信息。 */
export interface ArticleAuthor {
  name: string;
  url: string;
}

/** 快速文章采集配置选项。 */
export interface QuickArticleOptions {
  /** 正文内容的选择器，默认 ".RichText"。 */
  contentSelector?: string;
  /** 是否尝试提取评论（实验性）。 */
  includeComments?: boolean;
  /** 页面加载超时（毫秒），默认 30000。 */
  timeout?: number;
  /** 注入已有登录态（可选）。 */
  sessionState?: import("./ISessionManager").SessionState;
}

/** 单篇文章采集结果。 */
export interface ArticleResult {
  title: string;
  author: ArticleAuthor;
  /** 纯文本正文。 */
  content: string;
  /** 原始 HTML 片段。 */
  contentHtml: string;
  /** ISO 时间戳。 */
  capturedAt: string;
  /** 页面加载性能指标。 */
  performance?: import("../models").PageLoadMetrics;
}

/** 快速文章采集端口。定义采集一篇文章所需的能力。 */
export interface IQuickArticleCapture {
  /**
   * 采集单篇文章。
   * @param url 文章 URL。
   * @param options 可选配置（选择器、超时等）。
   */
  capture(url: string, options?: QuickArticleOptions): Promise<ArticleResult>;
}
