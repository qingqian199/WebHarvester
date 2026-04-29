import inquirer from "inquirer";
import * as readline from "readline";
import { loadAppConfig } from "./utils/config-loader";
import { ConsoleLogger } from "./adapters/ConsoleLogger";
import { PlaywrightAdapter } from "./adapters/PlaywrightAdapter";
import { FileStorageAdapter } from "./adapters/FileStorageAdapter";
import { HarvesterService } from "./core/services/HarvesterService";
import { BatchHarvestService } from "./services/BatchHarvestService";
import { loadBatchTasks } from "./utils/batch-loader";
import { WebServer } from "./web/WebServer";
import { FileSessionManager } from "./adapters/FileSessionManager";
import { FeatureFlags } from "./core/features";
import { startMainMenu, runAnalyzeFromMenu } from "./cli/main-menu";
import { AuthGuard } from "./utils/auth-guard";
import { LoginOracle } from "./utils/login-oracle";
import { BrowserLifecycleManager } from "./adapters/BrowserLifecycleManager";
import { captureSessionFromPage } from "./utils/session-helper";
import { SessionState } from "./core/ports/ISessionManager";
import {
  PAGE_LOAD_FALLBACK_TIMEOUT_MS,
  LOGIN_FORM_WAIT_MS,
  LOGIN_SUCCESS_POLL_MS,
  MANUAL_LOGIN_TIMEOUT_MS,
} from "./core/constants/GlobalConstant";

let activeWebServer: WebServer | null = null;

function registerShutdown() {
  const handle = async () => {
    console.log("\n\n⚠️  正在优雅关闭...");
    if (activeWebServer) {
      activeWebServer.stop();
      activeWebServer = null;
    }
    process.exit(0);
  };
  process.on("SIGINT", handle);
  process.on("SIGTERM", handle);
}

async function bootstrap() {
  registerShutdown();

  console.log(`
=============================================
  WebHarvester 逆向采集工具  v1.1.0
  低硬件适配 | 模块化解耦 | 工程化架构
=============================================
  `);

  const appCfg = await loadAppConfig();
  const logger = new ConsoleLogger();

  let running = true;
  while (running) {
    const action = await startMainMenu();

    if (action.type === "exit") {
      console.log("👋 再见！");
      running = false;
      break;
    }

    if (action.type === "login") {
      const sessionManager = new FileSessionManager();
      const oracle = new LoginOracle(sessionManager, logger);

      const intel = await oracle.gatherIntel(action.loginUrl);

      console.log("\n📋 登录情报分析结果：");
      console.log(`   登录接口：${intel.formAction || "未自动探测到，将使用表单提交"}`);
      console.log(`   用户名字段：${intel.paramMap.username}`);
      console.log(`   密码字段：${intel.paramMap.password}`);
      console.log(`   验证码：${intel.captchaRequired ? "需要" : "无需"}`);

      if (intel.captchaRequired) {
        console.log("\n⚠️ 检测到验证码相关字段（可能为误报），自动登录可能存在困难，将尝试继续...\n");
      }

      const { username, password } = await inquirer.prompt([
        { type: "input", name: "username", message: "请输入用户名/邮箱：" },
        { type: "password", name: "password", message: "请输入密码：" }
      ]);

      const session = await oracle.executeLogin(
        action.loginUrl,
        action.verifyUrl,
        intel,
        username,
        password,
        action.profile
      );

      if (session) {
        console.log(`✅ 登录成功！会话已保存为 [${action.profile}]`);
      } else {
        console.log("❌ 自动登录失败，请检查账号密码或手动操作");
      }
      console.log("");
      continue;
    }

    if (action.type === "qrcode") {
      const sessionManager = new FileSessionManager();
      const lcm = new BrowserLifecycleManager(logger);

      console.log("\n📱 扫码登录模式");
      console.log("正在打开浏览器...\n");

      try {
        const page = await lcm.launch(action.loginUrl, false, undefined, "domcontentloaded", MANUAL_LOGIN_TIMEOUT_MS);
        await page.waitForLoadState("load", { timeout: PAGE_LOAD_FALLBACK_TIMEOUT_MS }).catch(() => {});
        await page.waitForTimeout(LOGIN_FORM_WAIT_MS);

        await page.evaluate(() => {
          const keywords = ["登录", "登入"];
          const allEls = document.querySelectorAll<HTMLElement>("a, button, div, span, li");
          for (const el of allEls) {
            if (el.offsetWidth === 0 || el.offsetHeight === 0) continue;
            const text = el.textContent?.trim().toLowerCase() || "";
            if (keywords.some((k) => text === k)) { el.click(); return; }
          }
        });
        await page.waitForTimeout(LOGIN_FORM_WAIT_MS);

        console.log("========================================");
        console.log("📱 请使用手机 App 扫描屏幕上的二维码登录");
        console.log("💡 登录成功后程序将自动检测并保存会话");
        console.log("⏳ 等待扫码登录（最长 5 分钟）...");
        console.log("========================================\n");

        const start = Date.now();
        let loggedIn = false;

        while (Date.now() - start < MANUAL_LOGIN_TIMEOUT_MS) {
          await new Promise((r) => setTimeout(r, LOGIN_SUCCESS_POLL_MS));
          try {
            const currentUrl = page.url().split("?")[0];
            const initialUrl = action.loginUrl.split("?")[0];
            const urlChanged = currentUrl !== initialUrl;

            const hasAvatar = await page.evaluate(() =>
              document.querySelector(".bili-avatar, .user-avatar, .header-user-avatar, [class*='user-center']"),
            );
            const modalClosed = await page.evaluate(() => {
              const modal = document.querySelector(".bili-mini-mask, .modal, [class*='overlay']");
              return !modal;
            });

            if (urlChanged || hasAvatar || modalClosed) {
              loggedIn = true;
              break;
            }
          } catch {}
        }

        if (!loggedIn) throw new Error("扫码登录超时");

        const session = await captureSessionFromPage(page, page.context());
        await sessionManager.save(action.profile, session);
        console.log(`✅ 扫码登录成功！会话已保存为 [${action.profile}]`);
      } catch (e) {
        logger.error("扫码登录失败", { err: (e as Error).message });
        console.log("❌ 扫码登录失败或超时");
      } finally {
        await lcm.close();
      }

      console.log("");
      continue;
    }

    if (action.type === "analyze") {
      await runAnalyzeFromMenu();
      continue;
    }

    if (action.type === "web") {
      const web = new WebServer(logger);
      activeWebServer = web;
      await web.start();
      console.log("\n🌍 Web 面板已启动：http://localhost:3000");
      console.log("按 Enter 键停止面板并返回主菜单...\n");

      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      await new Promise<void>((resolve) => rl.question("", () => resolve()));
      rl.close();

      web.stop();
      activeWebServer = null;
      console.log("Web 面板已停止。\n");
      continue;
    }

    if (action.type === "batch") {
      const { tasks, concurrency } = await loadBatchTasks();
      if (tasks.length === 0) {
        console.log("⚠️ tasks.json 中没有任务，请先配置。\n");
        continue;
      }
      const batch = new BatchHarvestService(logger, appCfg.outputDir, concurrency);
      await batch.runBatch(tasks);
      console.log("");
      continue;
    }

    if (action.type === "single") {
      const sessionManager = new FileSessionManager();
      let sessionState: SessionState | null = null;

      if (action.profile && FeatureFlags.enableSessionPersist) {
        const verifyUrl = appCfg.auth?.verifyUrl || action.config.targetUrl;
        const loginUrl = appCfg.auth?.loginUrl || action.config.targetUrl;

        const authGuard = new AuthGuard(sessionManager);
        sessionState = await authGuard.ensureAuth(
          action.profile,
          loginUrl,
          verifyUrl
        );
        if (!sessionState) {
          console.log("❌ 无法获取有效登录会话，取消本次采集\n");
          continue;
        }
      }

      const browser = new PlaywrightAdapter(logger);
      const storage = new FileStorageAdapter(appCfg.outputDir);
      const svc = new HarvesterService(logger, browser, storage);
      await svc.harvest(
        action.config,
        "all",
        action.saveSession,
        sessionManager,
        action.profile,
        sessionState ?? undefined
      );
      console.log("");
    }
  }
}

bootstrap().catch((err) => {
  console.error("程序异常：", (err as Error).message);
  process.exit(1);
});
