import { HarvestResult } from "../models";

/** AI 摘要观察结果，用于轻量级分析和预览。 */
export interface AiCompactObservation {
  summary: string;
  pageMeta: {
    title: string;
    domain: string;
    renderType: "static" | "spa-dynamic";
  };
  endpoints: Array<{
    method: string;
    url: string;
    authType: string;
    dataFields: string[];
  }>;
  interactiveElements: Array<{
    alias: string;
    type: "input" | "button" | "form";
    selector: string;
    label?: string;
  }>;
  riskTips: string[];
}

/** AI 摘要生成器端口，将采集结果压缩为结构化摘要。 */
export interface IAiSummaryGenerator {
  /** 将采集结果转换为紧凑的 AI 可读格式。 */
  build(result: HarvestResult): AiCompactObservation;
}
