import fs from "fs/promises";
import path from "path";
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
import { ArticleCaptureService } from "./services/ArticleCaptureService";
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

async function handleSingleAction(action: import("./cli/main-menu").MenuAction & { type: "single" }, appCfg: Awaited<ReturnType<typeof loadAppConfig>>, logger: ConsoleLogger) {
  const sessionManager = new FileSessionManager();
  let sessionState: SessionState | null = null;

  if (action.profile && FeatureFlags.enableSessionPersist) {
    const verifyUrl = appCfg.auth?.verifyUrl || action.config.targetUrl;
    const loginUrl = appCfg.auth?.loginUrl || action.config.targetUrl;

    const authGuard = new AuthGuard(sessionManager);
    sessionState = await authGuard.ensureAuth(action.profile, loginUrl, verifyUrl);
    if (!sessionState) {
      logger.warn("❌ 无法获取有效登录会话，取消本次采集");
      return;
    }
  }

  const browser = new PlaywrightAdapter(logger);
  const storage = new FileStorageAdapter(appCfg.outputDir);
  const svc = new HarvesterService(logger, browser, storage);
  await svc.harvest(action.config, "all", action.saveSession, sessionManager, action.profile, sessionState ?? undefined);
}

async function handleBatchAction(action: import("./cli/main-menu").MenuAction & { type: "batch" }, appCfg: Awaited<ReturnType<typeof loadAppConfig>>, logger: ConsoleLogger) {
  const { tasks, concurrency } = await loadBatchTasks();
  if (tasks.length === 0) {
    logger.warn("⚠️ tasks.json 中没有任务，请先配置");
    return;
  }
  const batch = new BatchHarvestService(logger, appCfg.outputDir, concurrency);
  await batch.runBatch(tasks);
}

async function handleLoginAction(action: import("./cli/main-menu").MenuAction & { type: "login" }, logger: ConsoleLogger) {
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

  const session = await oracle.executeLogin(action.loginUrl, action.verifyUrl, intel, username, password, action.profile);
  if (session) logger.info(`✅ 登录成功！会话已保存为 [${action.profile}]`);
  else logger.error("❌ 自动登录失败，请检查账号密码或手动操作");
}

async function handleQrcodeAction(action: import("./cli/main-menu").MenuAction & { type: "qrcode" }, logger: ConsoleLogger) {
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

    const LOGIN_BTN_SELECTORS = [
      "a[href*=\"login\"], .login-btn, .header-login-btn",
      "[class*=\"header\"] [class*=\"login\"]",
      ".bili-header__bar-login-btn",
    ];

    const h = async () => { await new Promise((r) => setTimeout(r, LOGIN_SUCCESS_POLL_MS)); };
    const hasLoginBtn = async () => {
      for (const sel of LOGIN_BTN_SELECTORS) {
        const el = await page.$(sel);
        if (el && (await el.isVisible().catch(() => false))) return true;
      }
      return false;
    };
    const hasAuthCookie = async () => {
      const cookies = await page.context().cookies();
      return cookies.some((c) => ["session", "token", "sid", "sess"].some((w) => c.name.toLowerCase().includes(w)));
    };

    const start = Date.now();
    let loggedIn = false;

    while (Date.now() - start < MANUAL_LOGIN_TIMEOUT_MS) {
      await h();
      try {
        const currentUrl = page.url().split("?")[0];
        const urlChanged = currentUrl !== action.loginUrl.split("?")[0];
        if (urlChanged) { loggedIn = true; break; }

        if (await hasAuthCookie()) { loggedIn = true; break; }

        const noLoginBtn = !(await hasLoginBtn());
        if (noLoginBtn) { loggedIn = true; break; }
      } catch {}
    }

    if (!loggedIn) throw new Error("扫码登录超时");

    // 等待关键鉴权 Cookie 写入（如 B站 的 SESSDATA 在登录成功后可能会有延迟）
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const cookies = await page.context().cookies();
      const hasSessionCookie = cookies.some((c) =>
        ["sessdata", "sessionid", "token"].some((k) => c.name.toLowerCase().includes(k)),
      );
      if (hasSessionCookie) break;
    }

    const session = await captureSessionFromPage(page, page.context());
    await sessionManager.save(action.profile, session);
    console.log(`✅ 扫码登录成功！会话已保存为 [${action.profile}]`);
  } catch (e) {
    logger.error("扫码登录失败", { err: (e as Error).message });
  } finally {
    await lcm.close();
  }
}

async function handleQuickArticleAction(action: import("./cli/main-menu").MenuAction & { type: "quick-article" }, logger: ConsoleLogger) {
  const service = new ArticleCaptureService(logger, new FileSessionManager(), action.profile);
  try {
    const result = await service.capture(action.url);
    const slug = result.title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, "_").slice(0, 60) || "article";
    const outDir = path.resolve("output", "quick-article");
    const outFile = path.join(outDir, `${slug}.json`);
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(outFile, JSON.stringify(result, null, 2), "utf-8");

    console.log("\n═══════════════════════════════════");
    console.log(`  标题: ${result.title}`);
    console.log(`  作者: ${result.author.name}`);
    console.log(`  正文长度: ${result.content.length} 字符`);
    console.log(`  采集时间: ${result.capturedAt}`);
    console.log(`  已保存: ${outFile}`);
    console.log("═══════════════════════════════════\n");
    console.log("正文预览:\n");
    console.log(result.content.slice(0, 500) + (result.content.length > 500 ? "\n..." : ""));
  } catch (e) {
    logger.error("文章采集失败", { err: (e as Error).message });
    console.log("❌ 文章采集失败:", (e as Error).message);
  }
}

async function handleWebAction(logger: ConsoleLogger) {
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
  logger.info("Web 面板已停止");
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

    switch (action.type) {
      case "exit":
        console.log("👋 再见！");
        running = false;
        break;
      case "single":
        await handleSingleAction(action, appCfg, logger);
        break;
      case "batch":
        await handleBatchAction(action, appCfg, logger);
        break;
      case "login":
        await handleLoginAction(action, logger);
        break;
      case "qrcode":
        await handleQrcodeAction(action, logger);
        break;
      case "analyze":
        await runAnalyzeFromMenu();
        break;
      case "web":
        await handleWebAction(logger);
        break;
      case "quick-article":
        await handleQuickArticleAction(action, logger);
        break;
    }
    console.log("");
  }
}

bootstrap().catch((err) => {
  console.error("程序异常退出：", (err as Error).message);
  process.exit(1);
});
