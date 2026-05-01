import { NetworkRequest } from "../models";

/** 核心信息：爬虫前置分析需要的关键数据。 */
export interface CoreInfo {
  /** 筛选后的业务 API 端点列表（排除静态资源、埋点上报）。 */
  apiEndpoints: NetworkRequest[];
  /** 从 Storage 和 Cookies 中提取的鉴权令牌。 */
  authTokens: Record<string, string>;
  /** 设备指纹相关信息（Cookie 中的标识、UA 等）。 */
  deviceFingerprint: {
    cookies: Array<{ name: string; value: string; domain: string }>;
    localStorageKeys: string[];
  };
  /** 反爬检测结果（来自 AntiCrawlTagger）。 */
  antiCrawlDefenses: Array<{
    category: string;
    severity: string;
    requestKey: string;
  }>;
}

/** 次要信息：页面存档用，对爬虫前置分析帮助较小。 */
export interface SecondaryInfo {
  /** 完整的网络请求列表（包含静态资源、埋点等）。 */
  allCapturedRequests: NetworkRequest[];
  /** 页面 DOM 结构快照。 */
  domStructure: Array<{ tagName: string; selector: string; attributes: Record<string, string> }>;
  /** 页面加载性能指标。 */
  performanceMetrics?: import("../models").PageLoadMetrics;
  /** 原始采集结果中的其他内容。 */
  jsVariables: Record<string, unknown>;
  hiddenFields: Array<{ name: string; value?: string }>;
}

/** 分类后的采集结果。 */
export interface ClassifiedHarvestResult {
  classification: {
    version: "1.0";
    classifiedAt: string;
    /** 原始 HarvestResult 的 traceId，用于关联。 */
    originalTraceId: string;
  };
  core: CoreInfo;
  secondary: SecondaryInfo;
}
