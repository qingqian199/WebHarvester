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

export interface ElementItem {
  selector: string;
  tagName: string;
  attributes: Record<string, string>;
  text?: string;
}

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

export interface HarvestConfig {
  targetUrl: string;
  actions?: Array<{
    type: "click" | "input" | "wait" | "navigate";
    selector?: string;
    value?: string;
    waitTime?: number;
  }>;
  elementSelectors?: string[];
  jsScripts?: Array<string | { alias: string; script: string }>;
  networkCapture?: { captureAll: boolean };
  storageTypes?: Array<"localStorage" | "sessionStorage" | "cookies">;
}

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

export interface HarvestResult {
  traceId: string;
  targetUrl: string;
  networkRequests: NetworkRequest[];
  elements: ElementItem[];
  storage: StorageSnapshot;
  jsVariables: Record<string, unknown>;
  startedAt: number;
  finishedAt: number;
  pageMetrics?: PageLoadMetrics;
  analysis?: {
    apiRequests: NetworkRequest[];
    hiddenFields: ElementItem[];
    authInfo: {
      localStorage: Record<string, string>;
      sessionStorage: Record<string, string>;
    };
  };
}
