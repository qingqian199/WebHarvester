import fs from "fs/promises";
import path from "path";
import { IStorageAdapter } from "../core/ports/IStorageAdapter";
import { HarvestResult } from "../core/models";
import { getSafeDomainName } from "../utils/batch-loader";
import { FeatureFlags } from "../core/features";
import { generateHarString } from "../utils/exporter/har-exporter";
import { generateMarkdownReport } from "../utils/reporter/md-reporter";
import { generateApiCsv } from "../utils/reporter/csv-reporter";
import { AiSummaryGenerator } from "../utils/ai/ai-summary-generator";
import { SecurityAuditor } from "../utils/security/security-auditor";
import { SecurityAuditReport } from "../core/ports/ISecurityAudit";

export class LocalFileSystem {
  async mkdir(p: string): Promise<void> {
    await fs.mkdir(p, { recursive: true });
  }
  async writeFile(p: string, c: string): Promise<void> {
    await fs.writeFile(p, c, "utf-8");
  }
}

export class FileStorageAdapter implements IStorageAdapter {
  private readonly fs = new LocalFileSystem();

  constructor(private readonly outDir: string, private readonly cliArgs?: { aiMode?: boolean; securityAudit?: boolean }) {}

  async save(result: HarvestResult, outputFormat: string = "all"): Promise<void> {
    const domain = getSafeDomainName(result.targetUrl);
    const dir = path.join(this.outDir, domain);
    await this.fs.mkdir(dir);
    const baseName = `harvest-${result.traceId}`;

    const jsonPath = path.join(dir, `${baseName}.json`);
    await this.fs.writeFile(jsonPath, JSON.stringify(result, null, 2));

    if (["all", "md"].includes(outputFormat)) {
      const md = generateMarkdownReport(result);
      await this.fs.writeFile(path.join(dir, `${baseName}.md`), md);
    }

    if (["all", "csv"].includes(outputFormat)) {
      const csv = generateApiCsv(result.networkRequests);
      await this.fs.writeFile(path.join(dir, `${baseName}-api.csv`), csv);
    }

    if (FeatureFlags.enableHarExport && ["all", "har"].includes(outputFormat)) {
      const har = generateHarString(result);
      await this.fs.writeFile(path.join(dir, `${baseName}.har`), har);
    }

    if (FeatureFlags.enableAiCompactMode && this.cliArgs?.aiMode) {
      const aiGen = new AiSummaryGenerator();
      const aiData = aiGen.build(result);
      await this.fs.writeFile(path.join(dir, `${baseName}-ai-compact.json`), JSON.stringify(aiData, null, 2));
    }

    if (FeatureFlags.enableSecurityAudit && this.cliArgs?.securityAudit) {
      const auditor = new SecurityAuditor();
      const auditReport: SecurityAuditReport = auditor.scan(result);
      await this.fs.writeFile(path.join(dir, `${baseName}-security-audit.json`), JSON.stringify(auditReport, null, 2));
      const auditMd = this.buildAuditMarkdown(auditReport);
      await this.fs.writeFile(path.join(dir, `${baseName}-security-audit.md`), auditMd);
    }
  }

  getFileSys() {
    return this.fs;
  }

  private buildAuditMarkdown(report: SecurityAuditReport): string {
    const levelText = report.level === "high" ? "🔴 高危" : report.level === "medium" ? "🟡 中危" : "🟢 低危/安全";
    return `# 安全审计报告\n## 整体评分：${report.score}/100\n## 风险等级：${levelText}\n\n### 风险项\n${report.riskItems.map(i => `- [${i.type}] ${i.desc}\n 建议：${i.suggest}`).join("\n")}\n\n### Cookie 安全检测\n${report.cookieCheck.length ? report.cookieCheck.map(c => `- ${c}`).join("\n") : "✅ 全部合规"}\n\n### 敏感数据泄露\n${report.sensitiveDataLeak.length ? report.sensitiveDataLeak.map(s => `- ${s}`).join("\n") : "✅ 未检测到明文敏感数据"}\n`;
  }
}
