import { chromium, Browser, BrowserContext, Page } from "playwright";
import { ConsoleLogger } from "../ConsoleLogger";

const BOOTSTRAP_URL = "https://www.zhipin.com/web/geek/jobs";
const REFRESH_INTERVAL_MS = 30 * 60 * 1000;

const logger = new ConsoleLogger("info");

export interface BossSession {
  cookies: Record<string, string>;
  traceid: string;
}

/**
 * BOSS 直聘令牌服务。
 * 保持一个带完整反检测伪装的 Playwright 浏览器实例存活，
 * 通过 getZpStoken / getTraceId 让爬虫随时获取最新令牌。
 */
export class BossTokenService {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private _traceid = "";
  private _zpStoken = "";
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private started = false;

  get isRunning(): boolean {
    return this.started;
  }

  /** 启动令牌服务：启动浏览器 → 通过 browser-check → 保持存活。 */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    this.browser = await chromium.launch({
      headless: true,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-default-browser-check",
        "--no-first-run",
        "--disable-dev-shm-usage",
      ],
    });

    this.context = await this.browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      locale: "zh-CN",
    });

    this.page = await this.context.newPage();

    // 反检测: 注入 addInitScript
    await this.page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      Object.defineProperty(navigator, "plugins", {
        get: () => [1, 2, 3].map(() => ({ name: "Chrome Plugin", filename: "plugin.so", description: "" })),
      });
      Object.defineProperty(navigator, "languages", { get: () => ["zh-CN", "zh", "en"] });
      Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8 });
    });

    // 捕获 traceid
    this.page.on("request", (req) => {
      const tid = req.headers()["traceid"] as string;
      if (tid && !tid.startsWith("F-000000")) {
        this._traceid = tid;
      }
    });

    await this.page.goto(BOOTSTRAP_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await this.page.waitForSelector("#app", { timeout: 25000 }).catch(() => {});
    await this.page.waitForTimeout(3000);

    // 提取初始 __zp_stoken__
    await this.refreshZpStokenFromBrowser();
    // 提取初始 traceid
    if (!this._traceid) {
      await this.page.waitForTimeout(2000);
    }

    // 定期刷新
    this.refreshTimer = setInterval(() => this.refreshZpStokenFromBrowser(), REFRESH_INTERVAL_MS);
    if (typeof this.refreshTimer === "object" && "unref" in this.refreshTimer) {
      this.refreshTimer.unref();
    }

    const cookieCount = (await this.context.cookies()).length;
    logger.info("BOSS 令牌服务已启动", {
      cookieCount,
      hasTraceid: !!this._traceid,
      hasStoken: !!this._zpStoken,
    });

    // 进程退出时自动清理
    process.on("exit", () => { this.stop().catch(() => {}); });
    process.on("SIGINT", () => { this.stop().catch(() => {}); });
    process.on("SIGTERM", () => { this.stop().catch(() => {}); });
  }

  /** 获取当前 __zp_stoken__ cookie 值（同步读取缓存）。 */
  getZpStoken(): string {
    return this._zpStoken;
  }

  /** 强制从浏览器上下文刷新 __zp_stoken__（异步）。 */
  async refreshZpStokenFromBrowser(): Promise<string> {
    if (!this.page) return "";
    try {
      const cookies = await this.context!.cookies();
      const stoken = cookies.find((c) => c.name === "__zp_stoken__");
      if (stoken && stoken.value) {
        this._zpStoken = stoken.value;
      }
    } catch {}
    return this._zpStoken;
  }

  /** 获取当前 traceid。 */
  getTraceId(): string {
    return this._traceid;
  }

  /** 刷新 __zp_stoken__（通过模拟页面导航触发前端重新生成）。 */
  async refreshZpStoken(): Promise<void> {
    if (!this.page) return;
    try {
      // 触发一个安全校验相关的 GET 请求，让前端刷新 stoken
      await this.page.evaluate(() => fetch("/wapi/zpuser/wap/getSecurityGuideV1"));
      await this.page.waitForTimeout(2000);
      await this.getZpStoken();
      logger.info("__zp_stoken__ 已刷新", { hasStoken: !!this._zpStoken });
    } catch (e) {
      logger.warn("__zp_stoken__ 刷新失败", { err: (e as Error).message });
    }
  }

  /** 停止令牌服务，关闭浏览器。 */
  async stop(): Promise<void> {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
      this.context = null;
      this.page = null;
    }
    this.started = false;
    logger.info("BOSS 令牌服务已停止");
  }
}
