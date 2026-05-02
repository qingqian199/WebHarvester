/**
 * BOSS 直聘 __zp_stoken__ 令牌管理。
 * 通过 Playwright 浏览器实例保持登录态，自动刷新 __zp_stoken__。
 * 不依赖 JS 逆向，完全由真实浏览器生成。
 */
import { chromium, Browser, BrowserContext, Page } from "playwright";

const BOOTSTRAP_URL = "https://www.zhipin.com/web/geek/jobs";
const STOKEN_REFRESH_MS = 25 * 60 * 1000; // 25 分钟刷新一次（有效期约 30 分钟）

export class ZpTokenManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private _stoken = "";
  private _traceid = "";
  private _cookies: Record<string, string> = {};
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private _ready = false;
  private _resolveReady: (() => void) | null = null;
  private _readyPromise: Promise<void>;

  constructor() {
    this._readyPromise = new Promise((resolve) => { this._resolveReady = resolve; });
  }

  get isReady(): boolean { return this._ready; }
  get stoken(): string { return this._stoken; }
  get traceid(): string { return this._traceid; }
  get cookies(): Record<string, string> { return { ...this._cookies }; }
  get readyPromise(): Promise<void> { return this._readyPromise; }

  async start(): Promise<void> {
    if (this._ready) return;

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
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
      locale: "zh-CN",
    });

    this.page = await this.context.newPage();

    // 反检测
    await this.page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      Object.defineProperty(navigator, "plugins", {
        get: () => [{ name: "Chrome PDF Plugin" }, { name: "Chrome PDF Viewer" }, { name: "Native Client" }],
      });
      Object.defineProperty(navigator, "languages", { get: () => ["zh-CN", "zh", "en"] });
      Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8 });
    });

    // 捕获 traceid
    this.page.on("request", (req) => {
      const tid = req.headers()["traceid"] as string;
      if (tid && !tid.startsWith("F-000000")) this._traceid = tid;
    });

    await this.page.goto(BOOTSTRAP_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await this.page.waitForSelector("#app", { timeout: 25000 }).catch(() => {});
    await this.page.waitForTimeout(3000);

    await this.syncCookiesAndStoken();

    this._ready = true;
    this._resolveReady?.();

    // 定期刷新
    this.refreshTimer = setInterval(() => this.syncCookiesAndStoken(), STOKEN_REFRESH_MS);
    if (typeof this.refreshTimer === "object" && "unref" in this.refreshTimer) this.refreshTimer.unref();

    // 进程退出清理
    const cleanup = () => this.stop().catch(() => {});
    process.on("exit", cleanup);
    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
  }

  /** 同步浏览器 Cookie 和 __zp_stoken__ */
  async syncCookiesAndStoken(): Promise<void> {
    if (!this.context) return;
    try {
      const cookies = await this.context.cookies();
      const map: Record<string, string> = {};
      for (const c of cookies) {
        if (c.name.startsWith("__") || c.name === "ab_guid" || c.name === "zp_token" || c.name === "__zp_stoken__") {
          map[c.name] = c.value;
        }
      }
      this._cookies = map;
      this._stoken = map["__zp_stoken__"] || "";
    } catch {}
  }

  /** 强制刷新 Cookie 和 stoken（通过页面导航触发前端重新生成） */
  async forceRefresh(): Promise<void> {
    if (!this.page) return;
    try {
      await this.page.evaluate(() => fetch("/wapi/zpuser/wap/getSecurityGuideV1"));
      await this.page.waitForTimeout(3000);
      await this.syncCookiesAndStoken();
    } catch {}
  }

  /** 等待令牌服务就绪（超时机制已内置） */
  async waitReady(timeoutMs = 60000): Promise<void> {
    const start = Date.now();
    while (!this._ready && Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  async stop(): Promise<void> {
    if (this.refreshTimer) { clearInterval(this.refreshTimer); this.refreshTimer = null; }
    if (this.browser) { await this.browser.close().catch(() => {}); this.browser = null; this.context = null; this.page = null; }
    this._ready = false;
  }
}
