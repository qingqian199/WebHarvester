import { HarvesterService } from "../../core/services/HarvesterService";
import { PlaywrightAdapter } from "../../adapters/PlaywrightAdapter";
import { FileStorageAdapter } from "../../adapters/FileStorageAdapter";
import { FileSessionManager } from "../../adapters/FileSessionManager";
import { LightHttpEngine } from "../../adapters/LightHttpEngine";
import { AuthGuard } from "../../utils/auth-guard";
import { FeatureFlags } from "../../core/features";
import { CliDeps, CliAction } from "../types";

export async function handleSingleHarvest(deps: CliDeps, action: CliAction): Promise<void> {
  const sessionManager = new FileSessionManager();
  let sessionState = null;

  if (action.profile && FeatureFlags.enableSessionPersist) {
    const config = deps.config;
    const verifyUrl = config.auth?.verifyUrl || action.config?.targetUrl;
    const loginUrl = config.auth?.loginUrl || action.config?.targetUrl;
    const authGuard = new AuthGuard(sessionManager);
    sessionState = await authGuard.ensureAuth(action.profile, loginUrl, verifyUrl);
    if (!sessionState) {
      deps.logger.warn("❌ 无法获取有效登录会话，取消本次采集");
      return;
    }
  }

  const storage = new FileStorageAdapter(deps.config.outputDir);
  const httpEngine = new LightHttpEngine();

  // ChromeService 模式：连接用户已有 Chrome（共享登录态/Cookie）
  if ((action as any).useChromeService) {
    const port = deps.config.chromeService?.port ?? 9222;
    try {
      const browser = await PlaywrightAdapter.connectToChromeService(port, action.config?.targetUrl || "", deps.logger);
      const svc = new HarvesterService(deps.logger, browser, storage, httpEngine, deps.dispatcher);
      await svc.harvest(action.config, "all", action.saveSession, sessionManager, action.profile, sessionState ?? undefined);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      deps.logger.error("ChromeService 连接失败", { err: msg });
      console.log("\n❌ ChromeService 连接失败，请检查:");
      console.log("  1. Chrome 是否已启动 (--remote-debugging-port=" + port + ")");
      console.log("  2. config.json 中的 chromeService.port 是否正确");
      console.log("  3. 是否有其他程序占用了端口 " + port);
      console.log("  💡 可尝试关闭 ChromeService 后重试");
    }
    return;
  }

  const browser = new PlaywrightAdapter(deps.logger);
  const svc = new HarvesterService(deps.logger, browser, storage, httpEngine, deps.dispatcher);
  await svc.harvest(action.config, "all", action.saveSession, sessionManager, action.profile, sessionState ?? undefined);
}
