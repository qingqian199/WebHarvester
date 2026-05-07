import { chromium, Browser, BrowserContext, Page } from "playwright";
import { BackendConfig } from "../config";

/**
 * 抖音 x-secsdk-web-signature 签名服务。
 * 维护一个存活 Playwright 浏览器，加载抖音页面让 sec_sdk 初始化，
 * 通过 CDP 网络拦截捕获实时签名。
 */
export class DouyinSignService {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private _ready = false;
  private _started = false;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  /** 缓存的签名映射 endpoint → signature */
  private signatureCache = new Map<string, string>();
  private _readyPromise: Promise<void>;
  private _resolveReady: (() => void) | null = null;

  constructor(private config: BackendConfig) {
    this._readyPromise = new Promise((resolve) => { this._resolveReady = resolve; });
  }

  get isReady(): boolean { return this._ready; }
  get readyPromise(): Promise<void> { return this._readyPromise; }

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
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/147.0.0.0 Safari/537.36",
      locale: "zh-CN",
    });

    this.page = await this.context.newPage();

    // 拦截 douyin API 请求捕获签名头和端点列表
    const seenSet = new Set<string>();
    this.page.on("request", (req) => {
      const url = req.url();
      if (!url.includes("www.douyin.com") && !url.includes("amemv.com")) return;
      try {
        const u = new URL(url);
        const path = u.pathname;
        // 忽略静态资源
        if (path.match(/\.(png|jpg|jpeg|gif|webp|svg|ico|css|js|woff2?)/)) return;

        // 记录端点
        if (path.length > 5 && path.length < 200) {
          if (!seenSet.has(path)) {
            seenSet.add(path);
            this.seenEndpointList.push(path);
            if (this.seenEndpointList.length > 100) this.seenEndpointList.shift();
          }
        }

        // 捕获 x-secsdk-web-signature
        const sig = req.headers()["x-secsdk-web-signature"] as string | undefined;
        const sig2 = req.headers()["x-secsdk-csrf-token"] as string | undefined;
        if (sig && sig.length > 10) {
          this.signatureCache.set(path, sig);
        }
        if (sig2 && sig2.length > 10) {
          this.signatureCache.set(path + "_csrf", sig2);
        }

        // 捕获所有安全相关头
        for (const h of Object.keys(req.headers())) {
          if (h.includes("secsdk") || h.includes("sec-sdk") || h.includes("x-secsdk")) {
            const val = req.headers()[h] as string;
            if (val.length > 5) this.signatureCache.set(path + ":" + h, val.slice(0, 60));
          }
        }
      } catch {}
    });

    // 打开抖音页面加载 sec_sdk
    await this.page.goto("https://www.douyin.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
    await this.page.waitForTimeout(5000);

    // 滚动触发懒加载 API
    for (let i = 0; i < 3; i++) {
      await this.page.evaluate("window.scrollTo(0, document.body.scrollHeight * " + (0.3 + i * 0.2) + ")").catch(() => {});
      await this.page.waitForTimeout(2000);
    }

    // 导航到具体视频页触发更多 API
    try {
      await this.page.goto("https://www.douyin.com/video/7628853797644668179", { waitUntil: "domcontentloaded", timeout: 15000 });
      await this.page.waitForTimeout(3000);
      await this.page.evaluate("window.scrollTo(0, 500)").catch(() => {});
      await this.page.waitForTimeout(2000);
    } catch {}

    console.log(`[DouyinSignService] 捕获 ${seenSet.size} 个端点, ${this.signatureCache.size} 个签名`);
    this._ready = true;
    this._resolveReady?.();

    // 每 25 分钟滚动刷新签名缓存
    this.refreshTimer = setInterval(() => this.refresh(), this.config.stokenRefreshMs || 25 * 60 * 1000);
    if (this.refreshTimer && "unref" in this.refreshTimer) this.refreshTimer.unref();

    const cleanup = () => this.stop().catch(() => {});
    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
  }

  /** 通过页面交互刷新签名缓存。 */
  async refresh(): Promise<void> {
    if (!this.page) return;
    try {
      await this.page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.6)").catch(() => {});
      await this.page.waitForTimeout(3000);
      await this.page.evaluate("window.scrollTo(0, 0)").catch(() => {});
      await this.page.waitForTimeout(2000);
    } catch {}
  }

  /** 获取指定端点的签名。 */
  getSignature(endpoint: string): string | undefined {
    // 先精确匹配，再尝试前缀匹配
    const sig = this.signatureCache.get(endpoint);
    if (sig) return sig;
    for (const [key, val] of this.signatureCache) {
      if (endpoint.startsWith(key) || key.startsWith(endpoint)) return val;
    }
    return undefined;
  }

  /** 获取所有缓存的端点列表。 */
  getCachedEndpoints(): string[] {
    return [...this.signatureCache.keys()];
  }

  private seenEndpointList: string[] = [];
  /** 获取所有观察到的端点列表。 */
  getSeenEndpoints(): string[] {
    return [...this.seenEndpointList];
  }

  async stop(): Promise<void> {
    if (this.refreshTimer) { clearInterval(this.refreshTimer); this.refreshTimer = null; }
    try { await this.page?.close(); } catch {}
    try { await this.context?.close(); } catch {}
    try { await this.browser?.close(); } catch {}
    this.page = null;
    this.context = null;
    this.browser = null;
    this._ready = false;
  }
}
