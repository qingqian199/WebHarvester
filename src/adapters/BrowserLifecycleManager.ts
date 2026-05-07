import { chromium, Browser, BrowserContext, Page, Request, Response, BrowserContextOptions } from "playwright";
import { ILogger } from "../core/ports/ILogger";
import { DEFAULT_ACTION_TIMEOUT_MS } from "../core/config/index";
import { RealisticFingerprintProvider } from "./RealisticFingerprintProvider";
import { SessionState } from "../core/ports/ISessionManager";
import { NetworkRequest, PageLoadMetrics } from "../core/models";

const ANTI_DETECT_PLATFORM = "Win32";
const NETWORK_CAPTURE_TYPES = ["xhr", "fetch"];

function extractChromeVersion(ua: string): string {
  const m = ua.match(/Chrome\/(\d+)\./);
  return m ? m[1] : "124";
}

export class BrowserLifecycleManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private readonly fingerprintProvider = new RealisticFingerprintProvider();

  private capturedRequests: Map<string, NetworkRequest> = new Map();
  private isNetworkCaptureEnabled = false;
  private pageMetrics: PageLoadMetrics | null = null;
  private realHeaders: Map<string, Record<string, string>> = new Map();

  constructor(private readonly logger: ILogger) { }

  startNetworkCapture(enableFullCapture?: boolean, captureAllTypes?: boolean): void {
    if (!this.page) throw new Error("Page not initialized");
    if (this.isNetworkCaptureEnabled) return;
    this.isNetworkCaptureEnabled = true;

    const captureAll = enableFullCapture === true;
    const captureXhr = captureAllTypes === true;

    this.page.route("**/*", async (route) => {
      try {
        const req = route.request();
        const url = req.url();
        const method = req.method();
        const key = url + method;
        const resourceType = req.resourceType();
        const isTarget = captureAll || captureXhr || NETWORK_CAPTURE_TYPES.includes(resourceType);

        if (isTarget) {
          const response = await route.fetch();
          const entry = this.ensureEntry(key, url, method, req, resourceType);
          entry.statusCode = response.status();
          entry.completedAt = Date.now();
          const rawBody = await response.text().catch(() => null);
          entry.responseBody = captureXhr && rawBody && rawBody.length > 204800
            ? rawBody.slice(0, 204800)
            : rawBody;
          await route.fulfill({ response });
        } else {
          this.ensureEntry(key, url, method, req, resourceType);
          await route.continue();
        }
      } catch {
        await route.continue().catch(() => {});
      }
    });

    this.page.on("request", (req: Request) => {
      const url = req.url();
      const method = req.method();
      const key = url + method;
      this.realHeaders.set(key, req.headers());
      const existing = this.capturedRequests.get(key);
      if (existing) {
        existing.requestHeaders = { ...existing.requestHeaders, ...req.headers(), _realHeader: "1" };
      }
    });

    this.page.on("response", (res: Response) => {
      const key = res.url() + res.request().method();
      const existing = this.capturedRequests.get(key);
      if (existing && existing.statusCode === 0) {
        existing.statusCode = res.status();
        existing.completedAt = Date.now();
      }
    });

    const mode = captureXhr ? "增强（XHR+Fetch+静态资源）" : captureAll ? "全量" : "标准";
    this.logger.debug(`网络捕获已启用（${mode}模式，route + request + response 事件）`);
  }

  getCapturedRequests(): NetworkRequest[] {
    return Array.from(this.capturedRequests.values());
  }

  getPageMetrics(): PageLoadMetrics | null {
    return this.pageMetrics;
  }

  private async capturePageMetrics(): Promise<void> {
    if (!this.page) return;
    try {
      this.pageMetrics = await this.page.evaluate(() => {
        const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
        if (!nav) return null;
        const fcp = performance.getEntriesByType("paint").find(e => e.name === "first-contentful-paint") as PerformancePaintTiming | undefined;
        return {
          navigationStart: nav.startTime,
          domContentLoadedEventEnd: nav.domContentLoadedEventEnd,
          loadEventEnd: nav.loadEventEnd,
          domInteractive: nav.domInteractive,
          firstContentfulPaint: fcp?.startTime,
          duration: nav.duration,
          transferSize: nav.transferSize,
          encodedBodySize: nav.encodedBodySize,
          decodedBodySize: nav.decodedBodySize,
          protocol: nav.nextHopProtocol,
          type: nav.type,
        };
      });
    } catch {
      this.pageMetrics = null;
    }
  }

  private ensureEntry(key: string, url: string, method: string, req: Request, resourceType?: string): NetworkRequest {
    let existing = this.capturedRequests.get(key);
    if (!existing) {
      existing = {
        url,
        method,
        statusCode: 0,
        requestHeaders: req.headers(),
        requestBody: req.postData(),
        resourceType: resourceType || req.resourceType(),
        timestamp: Date.now(),
      };
      this.capturedRequests.set(key, existing);
    }
    return existing;
  }

  async launch(
    url: string,
    headless: boolean,
    sessionState?: SessionState,
    waitUntil: "load" | "domcontentloaded" | "networkidle" = "domcontentloaded",
    timeout?: number,
    proxyUrl?: string,
    pageSetup?: (page: Page) => Promise<void>,
    enableFullCapture?: boolean,
    captureAllTypes?: boolean,
  ): Promise<Page> {
    this.capturedRequests.clear();
    this.isNetworkCaptureEnabled = false;

    const args = [
      "--disable-blink-features=AutomationControlled",
      "--no-default-browser-check",
      "--no-first-run",
      "--disable-dev-shm-usage",
      "--disable-features=IsolateOrigins,site-per-process",
      "--disable-web-security",
    ];
    if (proxyUrl) args.push(`--proxy-server=${proxyUrl}`);

    this.browser = await chromium.launch({
      headless,
      args,
    });

    const fp = this.fingerprintProvider.getFingerprint();
    const contextOpts: BrowserContextOptions = {
      viewport: fp.viewport,
      locale: fp.locale,
      userAgent: fp.userAgent,
      extraHTTPHeaders: {
        "Accept-Language": fp.acceptLanguage,
        "sec-ch-ua": `"Chromium";v="${extractChromeVersion(fp.userAgent)}", "Google Chrome";v="${extractChromeVersion(fp.userAgent)}", "Not-A.Brand";v="99"`,
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": `"${fp.platform === "Win32" ? "Windows" : fp.platform === "MacIntel" ? "macOS" : "Linux"}"`,
      },
    };

    this.context = await this.browser.newContext(contextOpts);
    this.page = await this.context.newPage();

    await this.page.addInitScript((platform: string) => {
      // 隐藏自动化标志
      Object.defineProperty(navigator, "webdriver", { get: () => false });

      // 模拟真实插件列表
      const pluginData = [
        { name: "Chrome PDF Plugin", filename: "internal-pdf-viewer" },
        { name: "Chrome PDF Viewer", filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai" },
        { name: "Native Client", filename: "internal-nacl-plugin" },
      ];
      Object.defineProperty(navigator, "plugins", {
        get: () => ({
          length: pluginData.length,
          item: (i: number) => pluginData[i] || null,
          namedItem: (n: string) => pluginData.find(p => p.name === n) || null,
          refresh: () => {},
          ...Object.fromEntries(pluginData.map((p, i) => [i, p])),
        }),
      });

      // 覆盖 permissions.query 不暴露自动化。
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Playwright sandboxes navigator.permissions
      const originalQuery = (navigator as any).permissions.query.bind((navigator as any).permissions);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Playwright's navigator.permissions.query API
      (navigator as any).permissions.query = (p: any) =>
        p.name === "notifications"
          ? Promise.resolve({ state: "denied" })
          : originalQuery(p);

      // 覆盖 languages 为正常值
      Object.defineProperty(navigator, "languages", { get: () => ["zh-CN", "zh", "en"] });

      // 覆盖 platform
      Object.defineProperty(navigator, "platform", { get: () => platform });

      // 覆盖硬件并发数
      Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8 });
    }, ANTI_DETECT_PLATFORM);

    this.startNetworkCapture(enableFullCapture, captureAllTypes);

    if (sessionState) {
      const cookies = sessionState.cookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain.startsWith(".") ? c.domain : `.${c.domain}`,
        path: c.path || "/",
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: ["Strict", "Lax", "None"].includes(String(c.sameSite))
          ? c.sameSite as "Strict" | "Lax" | "None"
          : undefined,
      }));
      await this.context.addCookies(cookies);
    }

    this.page.setDefaultTimeout(timeout ?? DEFAULT_ACTION_TIMEOUT_MS);

    if (pageSetup) {
      await pageSetup(this.page).catch((e) => this.logger.warn("pageSetup 失败", { err: (e as Error).message }));
    }

    await this.page.goto(url, { waitUntil, timeout: timeout ?? DEFAULT_ACTION_TIMEOUT_MS });
    return this.page;
  }

  /** 从已存在的 BrowserContext 创建页面（复用池化浏览器，反检测脚本通过 addInitScript 注入）。 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
  async attachToContext(context: any, url: string, sessionState?: SessionState, pageSetup?: (page: any) => Promise<void>): Promise<void> {
    this.capturedRequests.clear();
    this.isNetworkCaptureEnabled = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.context = context as any;
    this.pooled = true;
    this.page = await context.newPage();

    if (sessionState) {
// eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cookies = sessionState.cookies.map((c: any) => ({
        name: c.name, value: c.value,
        domain: c.domain.startsWith(".") ? c.domain : `.${c.domain}`,
        path: c.path || "/",
        httpOnly: c.httpOnly, secure: c.secure,
        sameSite: ["Strict", "Lax", "None"].includes(String(c.sameSite)) ? c.sameSite as "Strict" | "Lax" | "None" : undefined,
      }));
      await context.addCookies(cookies);
    }
    if (pageSetup) await pageSetup(this.page!).catch(() => {});
    this.startNetworkCapture();
    await this.page!.goto(url, { waitUntil: "domcontentloaded" });
  }

  getPage(): Page {
    if (!this.page) throw new Error("Page not initialized");
    return this.page;
  }

  private pooled = false;

  /** 标记为池化模式：close() 只关闭 page，不关闭 context/browser。 */
  markPooled(): void { this.pooled = true; }

  async close(): Promise<void> {
    await this.page?.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {});
    await this.page?.close().catch(() => {});
    this.page = null;
    if (!this.pooled) {
      await this.context?.close().catch(() => {});
      await this.browser?.close().catch(() => {});
      this.browser = null;
      this.context = null;
    }
  }
}
