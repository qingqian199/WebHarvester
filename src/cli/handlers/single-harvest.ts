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
    } catch { deps.logger.warn("CDP 直连失败，切换到 Node.js 子进程"); }

    // 兜底：Node.js 子进程 CDP 抓取（绕过 Bun WebSocket 不兼容）
    try {
      const { execFile } = await import("child_process");
      const path_mod = await import("path");
      const fs_mod = await import("fs");
      const helperPath = path_mod.resolve(process.cwd(), "scripts", "cdp-harvest.mjs");
      // 确保脚本存在
      if (!fs_mod.existsSync(helperPath)) { throw new Error(`CDP helper not found: ${helperPath}`); }

      const resultJson = await new Promise<string>((resolve, reject) => {
        const proc = execFile("node", [helperPath, String(port), url], { timeout: 60000, windowsHide: true }, (err, stdout) => {
          if (err) { reject(err); return; }
          resolve(stdout);
        });
        proc.stderr?.on("data", (d: Buffer) => deps.logger.warn("[CDP] " + d.toString().trim()));
      });
      const result = JSON.parse(resultJson.trim().split("\n").pop() || "{}");
      if (!result.success) throw new Error(result.error || "CDP harvest failed");

      deps.logger.info(`✅ CDP 页面抓取成功: ${result.title}`);
      console.log(`\n📄 页面标题: ${result.title}`);
      console.log(`📐 内容长度: ${(result.text || "").length} 字符`);

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `cdp-harvest-${timestamp}.json`;
      const outDir = deps.config.outputDir || "output";
      fs_mod.mkdirSync(outDir, { recursive: true });
      fs_mod.writeFileSync(path_mod.join(outDir, filename), JSON.stringify(result, null, 2), "utf-8");
      console.log(`💾 已保存: ${outDir}/${filename}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      deps.logger.error("ChromeService 连接失败", { err: msg });
      console.log("\n❌ ChromeService 连接失败，请检查:\n  1. Chrome 是否已启动 (--remote-debugging-port=" + port + ")\n  2. config.json 中的 chromeService.port 是否正确\n  3. 是否有其他程序占用了端口 " + port + "\n  💡 可尝试关闭 ChromeService 后重试");
    }
    return;
  }

  const browser = new PlaywrightAdapter(deps.logger);
  const svc = new HarvesterService(deps.logger, browser, storage, httpEngine, deps.dispatcher);
  await svc.harvest(action.config, "all", action.saveSession, sessionManager, action.profile, sessionState ?? undefined);
}
