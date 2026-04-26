import { loadAppConfig } from "./utils/config-loader";
import { startInteractiveCli } from "./cli/interactive-cli";
import { parseCliArgs } from "./utils/cli-args";
import { ConsoleLogger } from "./adapters/ConsoleLogger";
import { PlaywrightAdapter } from "./adapters/PlaywrightAdapter";
import { FileStorageAdapter } from "./adapters/FileStorageAdapter";
import { HarvesterService } from "./core/services/HarvesterService";
import { BatchHarvestService } from "./services/BatchHarvestService";
import { loadBatchTasks } from "./utils/batch-loader";
import { WebServer } from "./web/WebServer";
import { FileSessionManager } from "./adapters/FileSessionManager";
import { SessionState } from "./core/ports/ISessionManager";
import { FeatureFlags } from "./core/features";
import { ResultAnalyzer } from "./utils/analyzer";
import fs from "fs/promises";
import { HarvestResult } from "./core/models";

async function bootstrap() {
  console.log(`
=============================================
  WebHarvester 逆向采集工具  v1.0.0
  低硬件适配 | 模块化解耦 | 工程化架构
=============================================
  `);

  const appCfg = await loadAppConfig();
  const logger = new ConsoleLogger();
  const cliArgs = parseCliArgs();

  // ---------- 分析模式：直接对已有 JSON 生成 HTML 报告 ----------
  if (cliArgs.analyzeFile) {
    try {
      const raw = await fs.readFile(cliArgs.analyzeFile, "utf-8");
      const result = JSON.parse(raw) as HarvestResult;
      const summary = ResultAnalyzer.summarize(result);
      const html = ResultAnalyzer.generateHtmlReport(summary, result);
      const outPath = cliArgs.analyzeFile.replace(/\.json$/, "-report.html");
      await fs.writeFile(outPath, html);
      console.log(`✅ 分析报告已生成：${outPath}`);
    } catch (e) {
      console.error("❌ 分析失败：", (e as Error).message);
      process.exit(1);
    }
    return;
  }

  const sessionManager = new FileSessionManager();

  // Web面板模式
  if (process.argv.includes("--web")) {
    const web = new WebServer();
    await web.start();
    return;
  }

  // 纯批量模式
  if (process.argv.includes("--batch")) {
    const { tasks } = await loadBatchTasks();
    const browser = new PlaywrightAdapter(logger);
    const storage = new FileStorageAdapter(appCfg.outputDir, { aiMode: cliArgs.aiMode, securityAudit: cliArgs.securityAudit });
    const batch = new BatchHarvestService(logger, browser, storage);
    await batch.runBatch(tasks);
    return;
  }

  // 交互式CLI
  const cliRes = await startInteractiveCli();

  // 加载历史会话
  let bindSessionState: SessionState | null = null;
  if (cliArgs.profile && FeatureFlags.enableSessionPersist) {
    bindSessionState = await sessionManager.load(cliArgs.profile);
    if (bindSessionState) {
      logger.info(`✅ 已加载历史会话：${cliArgs.profile}`);
    } else {
      logger.warn(`⚠️ 未找到会话记录：${cliArgs.profile}`);
    }
  }

  const browser = new PlaywrightAdapter(logger);
  const storage = new FileStorageAdapter(appCfg.outputDir, { aiMode: cliArgs.aiMode, securityAudit: cliArgs.securityAudit });

  if (cliRes.mode === "batch") {
    const { tasks } = await loadBatchTasks();
    const batch = new BatchHarvestService(logger, browser, storage);
    await batch.runBatch(tasks);
  } else {
    const svc = new HarvesterService(logger, browser, storage);

    // 如果有历史会话，注入到浏览器
    if (bindSessionState) {
      await browser.launch(cliRes.singleConfig!.targetUrl, bindSessionState);
    }

    await svc.harvest(
      cliRes.singleConfig!,
      cliArgs.outputFormat,
      cliArgs.saveSession,
      sessionManager,
      cliArgs.profile
    );
  }
}

bootstrap().catch(err => {
  console.error("程序异常：", (err as Error).message);
  process.exit(1);
});