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
import { CrawlerDispatcher } from "./core/services/CrawlerDispatcher";
import { XhsCrawler, XhsApiEndpoints, XhsFallbackEndpoints } from "./adapters/crawlers/XhsCrawler";
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

  const dispatcher = createCrawlerDispatcher(appCfg);
  const browser = new PlaywrightAdapter(logger);
  const storage = new FileStorageAdapter(appCfg.outputDir);
  const svc = new HarvesterService(logger, browser, storage, undefined, dispatcher);
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

async function handleCrawlerSiteAction(action: import("./cli/main-menu").MenuAction & { type: "crawler-site" }, appCfg: Awaited<ReturnType<typeof loadAppConfig>>, logger: ConsoleLogger) {
  const dispatcher = createCrawlerDispatcher(appCfg);
  const crawler = dispatcher.dispatch(action.url);
  if (!crawler) { console.log("❌ 无匹配的特化爬虫"); return; }

  let session: import("./core/ports/ISiteCrawler").CrawlerSession | undefined;
  if (action.profile) {
    const sm = new FileSessionManager();
    const s = await sm.load(action.profile);
    if (s) session = { cookies: s.cookies, localStorage: s.localStorage };
  }

  try {
    // 如果是小红书，显示端点菜单
    if (crawler.name === "xiaohongshu") {
      const { default: inq } = await import("inquirer");

      // 构建菜单：签名直连（含状态标记）+ 兜底方案
      const statusIcon = (s: string) => s === "verified" ? "✅" : s === "risk_ctrl" ? "⛔" : "🔶";
      const statusText = (s: string) => s === "verified" ? "" : s === "risk_ctrl" ? "(风控)" : "(签名待优化)";
      const sigChoices = XhsApiEndpoints.map((e: any) => ({
        name: `${statusIcon(e.status ?? "sig_pending")} ${e.name} ${statusText(e.status ?? "sig_pending")}`.trim(),
        value: `sig:${e.name}`,
      }));
      const fallbackChoices = XhsFallbackEndpoints.map((e: any) => ({
        name: `🟠 ${e.name} (页面提取)`, value: `fb:${e.name}`,
      }));
      const choices = [
        { name: "━━━ 签名直连（推荐）━━━", value: "__sep1__", disabled: true },
        ...sigChoices,
        { name: "━━━ 兜底：页面 HTML 提取 ━━━", value: "__sep2__", disabled: true },
        ...fallbackChoices,
      ];

      const { selected } = await inq.prompt([{ type: "list", name: "selected", message: "选择采集方式：", choices }]);

      if (selected.startsWith("sig:")) {
        // 签名直连
        const epName = selected.slice(4);
        const ep = XhsApiEndpoints.find((e: any) => e.name === epName);
        if (ep?.status === "risk_ctrl") {
          console.log("\n⛔ 注意：该端点可能触发风控（code 300011）");
          console.log("建议：稍后重试、更换账号，或使用页面提取兜底方案\n");
        }
        let paramsStr = ep?.params ?? "";
        if (ep?.params) {
          const { p } = await inq.prompt([{ type: "input", name: "p", message: "查询参数（留空默认）：", default: ep.params }]);
          paramsStr = p;
        }
        const paramsRecord: Record<string, string> = {};
        paramsStr.split("&").filter(Boolean).forEach((pair) => {
          const [k, ...vs] = pair.split("=");
          if (k) paramsRecord[k] = decodeURIComponent(vs.join("="));
        });
        const result = await (crawler as any).fetchApi(epName, paramsRecord, session);
        const outDir = path.resolve("output", crawler.name);
        await fs.mkdir(outDir, { recursive: true });
        const outFile = path.join(outDir, `${crawler.name}-${epName}-${Date.now()}.json`);
        await fs.writeFile(outFile, JSON.stringify(result, null, 2), "utf-8");
        console.log(`\n✅ ${crawler.name} - ${epName} (签名直连)`);
        console.log(`   耗时: ${result.responseTime}ms`);
        console.log(`   已保存: ${outFile}`);
        if (result.headers["content-type"]?.includes("json")) {
          const body = JSON.parse(result.body);
          console.log(`   响应: code=${body.code} ${body.msg || ""}`);
          if (body.code === 0 || body.code === 1000) {
            console.log(`   数据预览: ${JSON.stringify(body.data).slice(0, 300)}`);
          }
        }
      } else if (selected.startsWith("fb:")) {
        // 页面提取（浏览器引擎）
        const fbName = selected.slice(3);
        const fb = XhsFallbackEndpoints.find((e: any) => e.name === fbName);
        if (!fb) { console.log("❌ 未知兜底端点"); return; }
        const { params: userParams } = await inq.prompt([{ type: "input", name: "params", message: "请输入 URL 参数（如 keyword=原神）：" }]);
        const url = fb.pageUrl.replace(/\{(\w+)\}/g, (_: string, k: string) => {
          const m = userParams.match(new RegExp(`${k}=([^&]+)`));
          return m ? encodeURIComponent(decodeURIComponent(m[1])) : k;
        });
        console.log(`\n⏳ 正在通过浏览器打开: ${url}`);
        const PlaywrightAdapter = (await import("./adapters/PlaywrightAdapter")).PlaywrightAdapter;
        const br = new PlaywrightAdapter(logger);
        await br.launch(url, session ? {
          cookies: session.cookies.map(c => ({ name: c.name, value: c.value, domain: c.domain ?? ".xiaohongshu.com", path: "/", httpOnly: false, secure: false, sameSite: "Lax" as const })),
          localStorage: session.localStorage ?? {},
          sessionStorage: {}, createdAt: Date.now(), lastUsedAt: Date.now(),
        } : undefined);
        const extracted = await br.executeScript<string>(fb.extractScript).catch(() => "{}");
        await br.close();
        const outDir = path.resolve("output", crawler.name);
        await fs.mkdir(outDir, { recursive: true });
        const outFile = path.join(outDir, `${crawler.name}-${fbName}-${Date.now()}.json`);
        const result = { url, source: "html-extract", endpoint: fbName, data: extracted, capturedAt: new Date().toISOString() };
        await fs.writeFile(outFile, JSON.stringify(result, null, 2), "utf-8");
        console.log(`\n✅ ${crawler.name} - ${fbName} (页面提取)`);
        console.log(`   已保存: ${outFile}`);
        console.log(`   数据预览: ${extracted.slice(0, 500)}`);
      }
      return;
    }

    // 通用特化爬虫（无端点选择）
    const result = await crawler.fetch(action.url, session);
    console.log(`\n✅ ${crawler.name} 采集完成`);
    console.log(`   状态码: ${result.statusCode}`);
    console.log(`   耗时: ${result.responseTime}ms`);
    console.log(`   正文长度: ${result.body.length} 字符`);
    const outDir = path.resolve("output", crawler.name);
    await fs.mkdir(outDir, { recursive: true });
    const outFile = path.join(outDir, `${crawler.name}-${Date.now()}.json`);
    await fs.writeFile(outFile, JSON.stringify(result, null, 2), "utf-8");
    console.log(`   已保存: ${outFile}`);
  } catch (e) {
    logger.error(`${crawler.name} 采集失败`, { err: (e as Error).message });
    console.log("❌ 采集失败:", (e as Error).message);
  }
}

async function handleGenStubAction(logger: ConsoleLogger) {
  const { filePath } = await (await import("inquirer")).default.prompt([
    { type: "input", name: "filePath", message: "采集结果 JSON 文件路径：" },
  ]);
  try {
    const { StubGenerator } = await import("./utils/crawl-ops/stub-generator");
    const raw = await fs.readFile(filePath, "utf-8");
    const result = JSON.parse(raw);
    const gen = new StubGenerator();
    const { lang } = await (await import("inquirer")).default.prompt([
      { type: "list", name: "lang", message: "选择语言：", choices: ["python", "javascript"] }
    ]);
    const stub = gen.generateWbiStub(result, lang);
    if (!stub) { console.log("⚠️ 未能生成桩代码（缺少 WBI 密钥）"); return; }
    const dir = path.dirname(filePath);
    const ext = lang === "python" ? "py" : "js";
    const stubPath = path.join(dir, `wbi-stub.${ext}`);
    const testPath = path.join(dir, `wbi-test.${ext}`);
    await fs.writeFile(stubPath, stub.code);
    await fs.writeFile(testPath, stub.testCode);
    console.log(`✅ 桩代码: ${stubPath}`);
    console.log(`✅ 测试文件: ${testPath}`);
  } catch (e) {
    logger.error("生成桩代码失败", { err: (e as Error).message });
    console.log("❌ 生成失败:", (e as Error).message);
  }
}

async function handleViewSessionsAction(_logger: ConsoleLogger) {
  const { FileSessionManager } = await import("./adapters/FileSessionManager");
  const sm = new FileSessionManager();
  const list = await sm.listProfiles();
  if (list.length === 0) { console.log("📂 暂无已存会话\n"); return; }
  console.log("\n📂 已存会话：\n");
  for (const name of list) {
    const state = await sm.load(name);
    if (!state) { console.log(`  ${name} [无法读取]`); continue; }
    const created = new Date(state.createdAt).toLocaleString();
    const age = Math.round((Date.now() - state.createdAt) / 1000 / 60);
    const expired = age > 60 * 24 * 14; // 14 days
    const status = expired ? "❌ 已过期" : "✅ 有效";
    console.log(`  ${name}`);
    console.log(`    创建: ${created} | Cookie: ${state.cookies.length} | ${status}`);
  }
  console.log("");
}

async function handleViewConfigAction() {
  const raw = await fs.readFile("config.json", "utf-8");
  const cfg = JSON.parse(raw);
  const masked = JSON.stringify(cfg, (key, val) => {
    if (typeof val === "string" && val.length > 20 && (key.includes("token") || key.includes("key") || key.includes("secret"))) {
      return val.slice(0, 8) + "****" + val.slice(-4);
    }
    return val;
  }, 2);
  console.log("\n📋 当前配置：\n");
  console.log(masked);
  console.log("");
}

async function handleToggleFeaturesAction(_logger: ConsoleLogger) {
  const flags = Object.entries(FeatureFlags);
  console.log("\n⚙️ 功能开关：\n");
  flags.forEach(([k, v]) => console.log(`  ${v ? "✅" : "⬜"} ${k.replace("enable", "")}`));
  const { flagName } = await (await import("inquirer")).default.prompt([
    { type: "list", name: "flagName", message: "选择要切换的开关：", choices: flags.map(([k]) => ({ name: `${k} (${FeatureFlags[k as keyof typeof FeatureFlags] ? "开" : "关"})`, value: k })) }
  ]);
  (FeatureFlags as any)[flagName] = !(FeatureFlags as any)[flagName];
  console.log(`\n✅ ${flagName} 已切换为 ${(FeatureFlags as any)[flagName] ? "开启" : "关闭"}（重启后恢复默认）\n`);
}

function createCrawlerDispatcher(appCfg: Awaited<ReturnType<typeof loadAppConfig>>): CrawlerDispatcher {
  const d = new CrawlerDispatcher();
  if (appCfg.crawlers?.xiaohongshu === "enabled") d.register(new XhsCrawler());
  return d;
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
      case "crawler-site":
        await handleCrawlerSiteAction(action, appCfg, logger);
        break;
      case "gen-stub":
        await handleGenStubAction(logger);
        break;
      case "view-sessions":
        await handleViewSessionsAction(logger);
        break;
      case "view-config":
        await handleViewConfigAction();
        break;
      case "toggle-features":
        await handleToggleFeaturesAction(logger);
        break;
    }
    console.log("");
  }
}

bootstrap().catch((err) => {
  console.error("程序异常退出：", (err as Error).message);
  process.exit(1);
});
