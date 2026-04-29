import { HarvestResult } from "../models";

/** 安全审计报告，包含整体评分、风险等级和详细检查项。 */
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

/** 安全审计器端口。对采集结果进行安全风险评估。 */
export interface ISecurityAuditor {
  /** 扫描采集结果，返回安全审计报告。 */
  scan(result: HarvestResult): SecurityAuditReport;
}
