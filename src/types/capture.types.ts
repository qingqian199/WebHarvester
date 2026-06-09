/** 单个 HTTP 交换记录 */
export interface HttpExchange {
  id: string;
  url: string;
  method: string;
  requestHeaders: Record<string, string>;
  requestBody?: string;
  responseStatus: number;
  responseHeaders: Record<string, string>;
  responseBody?: string;
  timestamp: number;
}

/** 捕获分析报告 */
export interface CaptureAnalysisReport {
  totalRequests: number;
  domain: string;
  suggestedUnits: SuggestedUnit[];
  potentialSignParams: string[];
  pathFrequency: Array<{ path: string; count: number; methods: string[] }>;
}

/** 建议的抓取单元 */
export interface SuggestedUnit {
  name: string;
  url: string;
  method: string;
  params: string[];
  paramMap: Record<string, string>;
}

/** 签名线索 */
export interface SigningClue {
  paramName: string;
  sampleValue: string;
  appearsIn: string[];
  notes: string;
}

/** 文件类型 */
export type CaptureFileType = "mitm" | "pcap";

/** 配置 */
export interface CaptureIntegrationConfig {
  tsharkPath?: string;
  mitmproxyPath?: string;
  defaultImportDir?: string;
}
