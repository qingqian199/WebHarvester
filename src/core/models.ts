/** 一次网络请求的完整记录。 */
export interface NetworkRequest {
  url: string;
  method: string;
  statusCode: number;
  requestHeaders: Record<string, string>;
  requestBody?: unknown;
  responseBody?: unknown;
  timestamp: number;
  completedAt?: number;
}

/** 页面 DOM 元素快照。 */
export interface ElementItem {
  /** 用于定位该元素的 CSS 选择器。 */
  selector: string;
  tagName: string;
  attributes: Record<string, string>;
  text?: string;
}

/** 页面客户端存储快照。 */
export interface StorageSnapshot {
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path?: string;
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: string;
  }>;
}

/** 采集任务配置。 */
export interface HarvestConfig {
  /** 目标页面 URL。 */
  targetUrl: string;
  /** 页面加载后执行的用户操作序列。 */
  actions?: Array<{
    type: "click" | "input" | "wait" | "navigate";
    selector?: string;
    value?: string;
    waitTime?: number;
  }>;
  /** 需要提取的 DOM 元素 CSS 选择器列表。 */
  elementSelectors?: string[];
  /** 自定义 JS 脚本列表。字符串为直接执行，对象为 {alias, script} 形式。 */
  jsScripts?: Array<string | { alias: string; script: string }>;
  networkCapture?: { captureAll: boolean };
  storageTypes?: Array<"localStorage" | "sessionStorage" | "cookies">;
}

/** 页面加载性能指标（Performance API）。 */
export interface PageLoadMetrics {
  navigationStart: number;
  domContentLoadedEventEnd: number;
  loadEventEnd: number;
  domInteractive: number;
  firstContentfulPaint?: number;
  duration: number;
  transferSize: number;
  encodedBodySize: number;
  decodedBodySize: number;
  protocol: string;
  type: string;
}

/** 一次采集任务的完整结果。 */
export interface HarvestResult {
  /** 全局唯一追踪 ID。 */
  traceId: string;
  targetUrl: string;
  networkRequests: NetworkRequest[];
  elements: ElementItem[];
  storage: StorageSnapshot;
  /** 自定义脚本执行结果。key 为 alias，value 为脚本返回值。 */
  jsVariables: Record<string, unknown>;
  startedAt: number;
  finishedAt: number;
  pageMetrics?: PageLoadMetrics;
  /** 规则引擎分析结果，包含 API 过滤、隐藏字段和鉴权信息。 */
  analysis?: {
    apiRequests: NetworkRequest[];
    hiddenFields: ElementItem[];
    authInfo: {
      localStorage: Record<string, string>;
      sessionStorage: Record<string, string>;
    };
  };
}
