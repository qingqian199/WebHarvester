import "source-map-support/register";
import { loadAppConfig } from "./utils/config-loader";
import { ConsoleLogger } from "./adapters/ConsoleLogger";
import { XhsCrawler } from "./adapters/crawlers/XhsCrawler";
import { ZhihuCrawler } from "./adapters/crawlers/ZhihuCrawler";
import { BilibiliCrawler } from "./adapters/crawlers/BilibiliCrawler";
import { TikTokCrawler } from "./adapters/crawlers/TikTokCrawler";
import { BossZhipinCrawler } from "./adapters/crawlers/BossZhipinCrawler";
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
import { CliAction } from "./cli/types";

let globalProxyProvider: IProxyProvider | undefined;

function registerShutdown() {
  const handle = async () => {
    console.log("\n\n⚠️  正在优雅关闭...");
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

  const logger = new ConsoleLogger();
  const dispatcher = createCrawlerDispatcher(appCfg);
  const deps = { config: appCfg, logger, dispatcher, proxyProvider: globalProxyProvider };

  let running = true;
  while (running) {
    const action = await startMainMenu();

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
    }
    console.log("");
  }
}

bootstrap().catch((err) => {
  const msg = formatError("E001", (err as Error).message);
  console.error(errorLabel(msg));
});
