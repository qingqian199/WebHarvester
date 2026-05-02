import { chromium, Browser, BrowserContext, Page } from "playwright";
import { BackendConfig } from "../config";

export class ZpTokenService {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private _stoken = "";
  private _traceid = "";
  private _cookies: Record<string, string> = {};
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private _ready = false;
  private _readyPromise: Promise<void>;
  private _resolveReady: (() => void) | null = null;
  private _started = false;

  constructor(private config: BackendConfig) {
    this._readyPromise = new Promise((resolve) => {
      this._resolveReady = resolve;
    });
  }

  get isReady(): boolean { return this._ready; }
  get stoken(): string { return this._stoken; }
  get traceid(): string { return this._traceid; }
  get cookies(): Record<string, string> { return { ...this._cookies }; }
  get readyPromise(): Promise<void> { return this._readyPromise; }
  get started(): boolean { return this._started; }

  async start(): Promise<void> {
    if (this._started) return;
    this._started = true;

    this.browser = await chromium.launch({
      headless: this.config.headless,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-default-browser-check",
        "--no-first-run",
        "--disable-dev-shm-usage",
      ],
    });

    this.context = await this.browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
      locale: "zh-CN",
    });

    this.page = await this.context.newPage();

    await this.page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      Object.defineProperty(navigator, "plugins", {
        get: () => [{ name: "Chrome PDF Plugin" }, { name: "Chrome PDF Viewer" }, { name: "Native Client" }],
      });
      Object.defineProperty(navigator, "languages", { get: () => ["zh-CN", "zh", "en"] });
      Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8 });
    });

    this.page.on("request", (req) => {
      const tid = req.headers()["traceid"] as string;
      if (tid && !tid.startsWith("F-000000")) this._traceid = tid;
    });

    await this.page.goto(this.config.bootstrapUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await this.page.waitForSelector("#app", { timeout: 25000 }).catch(() => {});
    await this.page.waitForTimeout(3000);

    await this.syncCookiesAndStoken();

    this._ready = true;
    this._resolveReady?.();

    this.refreshTimer = setInterval(() => this.syncCookiesAndStoken(), this.config.stokenRefreshMs);
    if (typeof this.refreshTimer === "object" && "unref" in this.refreshTimer) {
      this.refreshTimer.unref();
    }

    const cleanup = () => this.stop().catch(() => {});
    process.on("exit", cleanup);
    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
  }

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

  async forceRefresh(): Promise<void> {
    if (!this.page) return;
    try {
      await this.page.evaluate(() => fetch("/wapi/zpuser/wap/getSecurityGuideV1"));
      await this.page.waitForTimeout(3000);
      await this.syncCookiesAndStoken();
    } catch {}
  }

  async waitReady(timeoutMs = 60000): Promise<void> {
    const start = Date.now();
    while (!this._ready && Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

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
    this._ready = false;
    this._started = false;
  }
}
