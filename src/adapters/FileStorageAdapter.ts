import fs from "fs/promises";
import path from "path";
import { IStorageAdapter } from "../core/ports/IStorageAdapter";
import { formatError } from "../core/error/error-registry";
import { ConsoleLogger } from "./ConsoleLogger";
import { HarvestResult } from "../core/models";
import { getSafeDomainName } from "../utils/batch-loader";
import { FeatureFlags } from "../core/features";
import { generateHarString } from "../utils/exporter/har-exporter";
import { generateMarkdownReport } from "../utils/reporter/md-reporter";
import { generateApiCsv } from "../utils/reporter/csv-reporter";
import { AiSummaryGenerator } from "../utils/ai/ai-summary-generator";
import { SecurityAuditor } from "../utils/security/security-auditor";
import { SecurityAuditReport } from "../core/ports/ISecurityAudit";
import { AntiCrawlTagger } from "../utils/crawl-ops/anti-crawl-tagger";
import { StubGenerator } from "../utils/crawl-ops/stub-generator";

export class LocalFileSystem {
  async mkdir(p: string): Promise<void> {
    await fs.mkdir(p, { recursive: true });
  }
  async writeFile(p: string, c: string): Promise<void> {
    await fs.writeFile(p, c, "utf-8");
  }
}

export class FileStorageAdapter implements IStorageAdapter {
  private readonly fs: LocalFileSystem;

  constructor(
    private readonly outDir: string,
    private readonly cliArgs?: {
      aiMode?: boolean;
      securityAudit?: boolean;
      stubLanguage?: "python" | "javascript";
    },
    fs?: LocalFileSystem,
  ) {
    this.fs = fs ?? new LocalFileSystem();
  }

  async save(result: HarvestResult, outputFormat: string = "all"): Promise<void> {
    const domain = getSafeDomainName(result.targetUrl);
    const dir = path.join(this.outDir, domain);
    await this.fs.mkdir(dir);
    const baseName = `harvest-${result.traceId}`;

    // 缓存 JSON 字符串，各输出格式复用避免重复序列化
    const jsonStr = JSON.stringify(result, null, 2);
    const jsonPath = path.join(dir, `${baseName}.json`);

    const writes: Promise<void>[] = [
      this.fs.writeFile(jsonPath, jsonStr),
    ];

    if (["all", "md"].includes(outputFormat)) {
      writes.push(this.fs.writeFile(path.join(dir, `${baseName}.md`), generateMarkdownReport(result)));
    }

    if (["all", "csv"].includes(outputFormat)) {
      writes.push(this.fs.writeFile(path.join(dir, `${baseName}-api.csv`), generateApiCsv(result.networkRequests)));
    }

    if (FeatureFlags.enableHarExport && ["all", "har"].includes(outputFormat)) {
      writes.push(this.fs.writeFile(path.join(dir, `${baseName}.har`), generateHarString(result)));
    }

    if (FeatureFlags.enableAiCompactMode && this.cliArgs?.aiMode) {
      const aiGen = new AiSummaryGenerator();
      writes.push(this.fs.writeFile(path.join(dir, `${baseName}-ai-compact.json`), JSON.stringify(aiGen.build(result), null, 2)));
    }

    if (FeatureFlags.enableSecurityAudit && this.cliArgs?.securityAudit) {
      const auditor = new SecurityAuditor();
      const auditReport: SecurityAuditReport = auditor.scan(result);
      writes.push(this.fs.writeFile(path.join(dir, `${baseName}-security-audit.json`), JSON.stringify(auditReport, null, 2)));
      writes.push(this.fs.writeFile(path.join(dir, `${baseName}-security-audit.md`), this.buildAuditMarkdown(auditReport)));
    }

    if (FeatureFlags.enableAntiCrawlTagging) {
      const tagger = new AntiCrawlTagger();
      const items = tagger.tag(result.networkRequests);
      if (items.length > 0) {
        writes.push(this.fs.writeFile(path.join(dir, `${baseName}-anti-crawl.json`), JSON.stringify(items, null, 2)));
      }
    }

    if (FeatureFlags.enableStubGeneration) {
      const gen = new StubGenerator();
      const lang = this.cliArgs?.stubLanguage ?? "python";
      const wbiStub = gen.generateWbiStub(result, lang);
      if (wbiStub) {
        const ext = lang === "python" ? "py" : "js";
        writes.push(this.fs.writeFile(path.join(dir, `${baseName}-wbi-stub.${ext}`), wbiStub.code));
        writes.push(this.fs.writeFile(path.join(dir, `${baseName}-wbi-test.${ext}`), wbiStub.testCode));
      }
    }

    const results = await Promise.allSettled(writes);
    const logger = new ConsoleLogger("warn");
    for (const r of results) {
      if (r.status === "rejected") {
        logger.warn(formatError("E301", (r.reason as Error).message));
      }
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
