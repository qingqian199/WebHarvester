import { HarvestResult } from "../models";

export interface SecurityAuditReport {
  score: number;
  level: "safe" | "low" | "medium" | "high";
  riskItems: Array<{
    type: string;
    desc: string;
    suggest: string;
  }>;
  cookieCheck: string[];
  sensitiveDataLeak: string[];
}

export interface ISecurityAuditor {
  scan(result: HarvestResult): SecurityAuditReport;
}
