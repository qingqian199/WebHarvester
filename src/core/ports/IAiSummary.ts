import { HarvestResult } from "../models";

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

export interface IAiSummaryGenerator {
  build(result: HarvestResult): AiCompactObservation;
}
