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
    const url = action.config?.targetUrl || "";

    // 尝试正常 CDP 连接（Node.js 下有效，Bun 下会超时走 catch）
    try {
      const browser = await PlaywrightAdapter.connectToChromeService(port, url, deps.logger);
      const svc = new HarvesterService(deps.logger, browser, storage, httpEngine, deps.dispatcher);
      await svc.harvest(action.config, "all", action.saveSession, sessionManager, action.profile, sessionState ?? undefined);
      return;
    } catch {
      /* CDP 直连失败，回退到 Playwright MCP */
    }

    // 兜底：Playwright MCP（替代旧的 Node.js CDP 子进程）
    try {
      const { McpBrowserAdapter } = await import("../../mcp-client/browser-engine");
      const mcpBrowser = new McpBrowserAdapter(action.config?.device || "pc");
      const svc = new HarvesterService(deps.logger, mcpBrowser, storage, httpEngine, deps.dispatcher);
      await svc.harvest(action.config, "all", action.saveSession, sessionManager, action.profile, sessionState ?? undefined);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      deps.logger.error("浏览器采集失败", { err: msg });
      console.log("\n❌ 浏览器采集失败:", msg);
    }
    return;
  }

  const browser = new PlaywrightAdapter(deps.logger);
  const svc = new HarvesterService(deps.logger, browser, storage, httpEngine, deps.dispatcher);
  await svc.harvest(action.config, "all", action.saveSession, sessionManager, action.profile, sessionState ?? undefined);
}
