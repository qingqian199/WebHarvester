/** 轻量级 HTTP 请求结果，适用于不需要 JS 渲染的静态页面采集。 */
export interface LightHttpResult {
  html: string;
  statusCode: number;
  headers: Record<string, string>;
  finalUrl: string;
  responseTime: number;
}

/** 轻量级 HTTP 引擎端口。适用于不需要浏览器渲染的页面。 */
export interface ILightHttpEngine {
  /** 发送 HTTP GET 请求并返回纯 HTML 结果。 */
  fetch(url: string): Promise<LightHttpResult>;
}
