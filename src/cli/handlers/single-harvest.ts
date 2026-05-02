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

  const browser = new PlaywrightAdapter(deps.logger);
  const storage = new FileStorageAdapter(deps.config.outputDir);
  const httpEngine = new LightHttpEngine();
  const svc = new HarvesterService(deps.logger, browser, storage, httpEngine, deps.dispatcher);
  await svc.harvest(action.config, "all", action.saveSession, sessionManager, action.profile, sessionState ?? undefined);
}
