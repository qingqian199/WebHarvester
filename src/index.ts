import "source-map-support/register";
import fs from "fs";
import path from "path";
import { loadAppConfig } from "./utils/config-loader";
import { ConsoleLogger } from "./adapters/ConsoleLogger";
import { BaseCrawler } from "./adapters/crawlers/BaseCrawler";
import { XhsCrawler } from "./adapters/crawlers/XhsCrawler";
import { ZhihuCrawler } from "./adapters/crawlers/ZhihuCrawler";
import { BilibiliCrawler } from "./adapters/crawlers/BilibiliCrawler";
import { TikTokCrawler } from "./adapters/crawlers/TikTokCrawler";
import { BossZhipinCrawler } from "./adapters/crawlers/BossZhipinCrawler";
import { DouyinCrawler } from "./adapters/crawlers/DouyinCrawler";
import { BaiduScholarCrawler } from "./adapters/crawlers/BaiduScholarCrawler";
import { CrawlerDispatcher } from "./core/services/CrawlerDispatcher";
import { RoundRobinProxyProvider } from "./adapters/RoundRobinProxyProvider";
import { FeatureFlags, applyFeatureFlags } from "./core/features";
import { IProxyProvider } from "./core/ports/IProxyProvider";
import { configureBackendClient } from "./utils/backend-client";
import { formatError } from "./core/error/error-registry";
import { highlightTitle, errorLabel } from "./utils/cli-ui";
import { startMainMenu, runAnalyzeFromMenu } from "./cli/main-menu";
import { handleSingleHarvest } from "./cli/handlers/single-harvest";
import { handleCrawlerCollect } from "./cli/handlers/crawler-collect";
import { handleBatchHarvest } from "./cli/handlers/batch-harvest";
import { handleAccountLogin } from "./cli/handlers/account-login";
import { handleQrLogin } from "./cli/handlers/qr-login";
import { handleQuickArticle } from "./cli/handlers/quick-article";
import { handleGenStub } from "./cli/handlers/gen-stub";
import { handleViewSessions } from "./cli/handlers/view-sessions";
import { handleStartWeb, stopActiveWebServer } from "./cli/handlers/start-web";
import { handleViewConfig } from "./cli/handlers/view-config";
import { handleToggleFeatures } from "./cli/handlers/toggle-features";
import { handleExportComments } from "./cli/handlers/export-comments";
import { handleExportXhsComments } from "./cli/handlers/export-xhs-comments";
import { CliAction } from "./cli/types";

let globalProxyProvider: IProxyProvider | undefined;
let chromeServiceInstance: import("./services/ChromeService").ChromeService | null = null;

export let lastCapture: { site: string; url: string; units: string[] } | null = null;

export function setLastCapture(site: string, url: string, units: string[]): void {
  lastCapture = { site, url, units };
}

function buildStatusLine(): string {
  const parts: string[] = [];
  if (FeatureFlags.enableChromeService) parts.push("🔗 ChromeService");
  if (FeatureFlags.enableProxyPool) {
    const proxyOk = globalProxyProvider?.enabled && (globalProxyProvider.enabledCount ?? 0) > 0;
    parts.push(proxyOk ? "🟢 代理池" : "🔴 代理池");
  }
  try {
    const outDir = path.resolve("output");
    if (fs.existsSync(outDir)) {
      const dirs = fs.readdirSync(outDir, { withFileTypes: true }).filter((d) => d.isDirectory());
      let newest: { file: string; mtime: Date } | null = null;
      for (const dir of dirs) {
        const dirPath = path.join(outDir, dir.name);
        const files = fs.readdirSync(dirPath).filter((f) => f.endsWith(".json") || f.endsWith(".har"));
        for (const f of files) {
          const fp = path.join(dirPath, f);
          const st = fs.statSync(fp);
          if (!newest || st.mtime > newest.mtime) newest = { file: dir.name, mtime: st.mtime };
        }
      }
      if (newest) { const ago = Math.floor((Date.now() - newest.mtime.getTime()) / 60000); parts.push(`📁 最近采集: ${ago}分钟前 (${newest.file})`); }
    }
  } catch {}
  try {
    const sessionDir = path.resolve("sessions");
    if (fs.existsSync(sessionDir)) {
      const count = fs.readdirSync(sessionDir).filter((f) => f.endsWith(".session.json") || f.endsWith(".json")).length;
      if (count > 0) parts.push(`🔐 ${count}个会话`);
    }
  } catch {}
  return parts.length > 0 ? " " + parts.join(" | ") : "";
}

function registerShutdown() {
  const handle = async () => {
    console.log("\n\n⚠️  正在优雅关闭...");
    if (chromeServiceInstance) {
      chromeServiceInstance.stop();
      chromeServiceInstance = null;
    }
    stopActiveWebServer();
    process.exit(0);
  };
  process.on("SIGINT", handle);
  process.on("SIGTERM", handle);
}

function createCrawlerDispatcher(appCfg: Awaited<ReturnType<typeof loadAppConfig>>): CrawlerDispatcher {
  const d = new CrawlerDispatcher();
  if (appCfg.crawlers?.xiaohongshu === "enabled") d.register(new XhsCrawler(globalProxyProvider));
  if (appCfg.crawlers?.zhihu === "enabled") d.register(new ZhihuCrawler(globalProxyProvider));
  if (appCfg.crawlers?.bilibili === "enabled") d.register(new BilibiliCrawler(globalProxyProvider));
  if (appCfg.crawlers?.tiktok === "enabled") d.register(new TikTokCrawler(globalProxyProvider));
  if (appCfg.crawlers?.boss_zhipin === "enabled") d.register(new BossZhipinCrawler(globalProxyProvider));
  if (appCfg.crawlers?.douyin === "enabled") d.register(new DouyinCrawler(globalProxyProvider));
  if (appCfg.crawlers?.xueshu === "enabled") d.register(new BaiduScholarCrawler(globalProxyProvider));
  return d;
}

async function bootstrap() {
  registerShutdown();

  console.log(highlightTitle(`
=============================================
  WebHarvester 逆向采集工具  v1.1.0
  低硬件适配 | 模块化解耦 | 工程化架构
=============================================
  `));

  const appCfg = await loadAppConfig();
  if (appCfg.features) applyFeatureFlags(appCfg.features);

  if (FeatureFlags.enableBackendService && appCfg.backendService) {
    configureBackendClient(appCfg.backendService.baseUrl, appCfg.backendService.timeout);
    console.log(`🔌 后端服务已启用: ${appCfg.backendService.baseUrl}`);
  }

  if (FeatureFlags.enableProxyPool && appCfg.proxyPool) {
    globalProxyProvider = new RoundRobinProxyProvider(appCfg.proxyPool);
    globalProxyProvider.warmup().then(() => {
      console.log("✅ 代理预热完成，可用代理:", globalProxyProvider!.enabledCount);
    }).catch(() => {});
    globalProxyProvider.startHealthCheck();
  }

  if (FeatureFlags.enableChromeService && appCfg.chromeService) {
    const { ChromeService } = await import("./services/ChromeService");
    chromeServiceInstance = new ChromeService(appCfg.chromeService.port, appCfg.chromeService.chromePath, appCfg.chromeService.userDataDir);
    chromeServiceInstance.start().then(async () => {
      BaseCrawler.chromeServicePort = chromeServiceInstance!.port;
      try {
        const { registerCdpBrowser } = await import("./services/BrowserProvider");
        await registerCdpBrowser(chromeServiceInstance!.port);
        console.log(`✅ ChromeService 已就绪 (端口 ${chromeServiceInstance!.port})`);
      } catch (e: any) {
        console.error(`❌ ChromeService CDP 注册失败: ${e.message}`);
      }
    }).catch(() => {
      console.error("❌ ChromeService 启动失败");
    });
  }

  const logger = new ConsoleLogger();
  const dispatcher = createCrawlerDispatcher(appCfg);
  const deps = { config: appCfg, logger, dispatcher, proxyProvider: globalProxyProvider };

  let running = true;
  while (running) {
    const action = await startMainMenu(buildStatusLine());

    switch (action.type) {
      case "exit":
        console.log("👋 再见！");
        running = false;
        break;
      case "single":
        await handleSingleHarvest(deps, action as CliAction);
        break;
      case "batch":
        await handleBatchHarvest(deps);
        break;
      case "login":
        await handleAccountLogin(deps, action as CliAction);
        break;
      case "qrcode":
        await handleQrLogin(deps, action as CliAction);
        break;
      case "analyze":
        await runAnalyzeFromMenu();
        break;
      case "web":
        await handleStartWeb(deps);
        break;
      case "quick-article":
        await handleQuickArticle(deps, action as CliAction);
        break;
      case "crawler-site":
        await handleCrawlerCollect(deps, action as CliAction);
        break;
      case "gen-stub":
        await handleGenStub(deps);
        break;
      case "view-sessions":
        await handleViewSessions(deps);
        break;
      case "view-config":
        await handleViewConfig();
        break;
      case "toggle-features":
        await handleToggleFeatures(deps);
        break;
      case "export-comments":
        await handleExportComments();
        break;
      case "export-xhs-comments":
        await handleExportXhsComments();
        break;
      case "backend-status":
        await handleBackendStatus();
        break;
    }
    console.log("");
  }
}

async function handleBackendStatus(): Promise<void> {
  try {
    const { getBackendHealth } = await import("./utils/backend-client");
    const health = await getBackendHealth();
    console.log("\n🔌 后端服务状态:\n");
    for (const [svc, status] of Object.entries(health.services)) {
      const icon = status === "ready" ? "✅" : status === "standalone" ? "🟢" : status === "starting" ? "⏳" : status === "disabled" ? "⬜" : "❌";
      console.log(`  ${icon} ${svc}: ${status}`);
    }
    console.log("");
  } catch {
    console.log("\n❌ 后端服务不可用 (请启动 backend/)\n");
  }
}

bootstrap().catch((err) => {
  const msg = formatError("E001", (err as Error).message);
  console.error(errorLabel(msg));
});
