import { chromium, Browser, BrowserContext, Page, Request, Response, BrowserContextOptions } from "playwright";
import { ILogger } from "../core/ports/ILogger";
import { DEFAULT_ACTION_TIMEOUT_MS } from "../core/config/index";
import { FeatureFlags } from "../core/features";
import { RealisticFingerprintProvider } from "./RealisticFingerprintProvider";
import { SessionState } from "../core/ports/ISessionManager";
import { NetworkRequest, PageLoadMetrics } from "../core/models";

const ANTI_DETECT_PLATFORM = "Win32";
const NETWORK_CAPTURE_TYPES = ["xhr", "fetch"];

export class BrowserLifecycleManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private readonly fingerprintProvider = new RealisticFingerprintProvider();

  private capturedRequests: Map<string, NetworkRequest> = new Map();
  private isNetworkCaptureEnabled = false;
  private pageMetrics: PageLoadMetrics | null = null;

  constructor(private readonly logger: ILogger) { }

  startNetworkCapture(): void {
    if (!this.page) throw new Error("Page not initialized");
    if (this.isNetworkCaptureEnabled) return;
    this.isNetworkCaptureEnabled = true;

    this.page.route("**/*", async (route) => {
      try {
        const req = route.request();
        const url = req.url();
        const method = req.method();
        const key = url + method;
        const isApi = NETWORK_CAPTURE_TYPES.includes(req.resourceType());

        if (isApi) {
          const response = await route.fetch();
          const entry = this.ensureEntry(key, url, method, req);
          entry.statusCode = response.status();
          entry.completedAt = Date.now();
          entry.responseBody = await response.text().catch(() => null);
          await route.fulfill({ response });
        } else {
          this.ensureEntry(key, url, method, req);
          await route.continue();
        }
      } catch {
        await route.continue().catch(() => {});
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

    this.logger.debug("网络捕获已启用（route + response 事件）");
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

  private ensureEntry(key: string, url: string, method: string, req: Request): NetworkRequest {
    let existing = this.capturedRequests.get(key);
    if (!existing) {
      existing = {
        url,
        method,
        statusCode: 0,
        requestHeaders: req.headers(),
        requestBody: req.postData(),
        timestamp: Date.now(),
      };
      this.capturedRequests.set(key, existing);
    }
    return existing;
  }

  async launch(
    url: string,
    headless = true,
    sessionState?: SessionState,
    waitUntil: "networkidle" | "domcontentloaded" | "load" = "domcontentloaded",
    timeout?: number,
  ): Promise<Page> {
    this.capturedRequests.clear();
    this.isNetworkCaptureEnabled = false;

    this.browser = await chromium.launch({
      headless,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-default-browser-check",
        "--no-first-run",
        "--disable-dev-shm-usage",
      ],
    });

    const fp = this.fingerprintProvider.getFingerprint();
    const contextOpts: BrowserContextOptions = {
      viewport: fp.viewport,
      locale: fp.locale,
      extraHTTPHeaders: { "Accept-Language": fp.acceptLanguage },
    };
    if (FeatureFlags.enableDynamicFingerprint) {
      contextOpts.userAgent = fp.userAgent;
    }

    this.context = await this.browser.newContext(contextOpts);
    this.page = await this.context.newPage();

    await this.page.addInitScript((platform: string) => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      Object.defineProperty(navigator, "plugins", { get: () => [] });
      Object.defineProperty(navigator, "platform", { get: () => platform });
    }, ANTI_DETECT_PLATFORM);

    this.startNetworkCapture();

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
    await this.page.goto(url, { waitUntil, timeout: timeout ?? DEFAULT_ACTION_TIMEOUT_MS });

    if (sessionState) {
      await this.page.evaluate(
        ({ localData, sessionData }: { localData: Record<string, string>; sessionData: Record<string, string> }) => {
          localStorage.clear();
          sessionStorage.clear();
          Object.entries(localData).forEach(([k, v]) => localStorage.setItem(k, v));
          Object.entries(sessionData).forEach(([k, v]) => sessionStorage.setItem(k, v));
        },
        { localData: sessionState.localStorage, sessionData: sessionState.sessionStorage },
      ).catch((e) => this.logger.warn("恢复 localStorage 失败", { err: (e as Error).message }));
    }

    await this.capturePageMetrics();
    this.logger.info("页面加载完成", { url, waitUntil });
    return this.page;
  }

  getPage(): Page {
    if (!this.page) throw new Error("Page not initialized");
    return this.page;
  }

  async close(): Promise<void> {
    await this.page?.unrouteAll({ behavior: "ignoreErrors" }).catch(() => { });
    await this.page?.close().catch(() => { });
    await this.context?.close().catch(() => { });
    await this.browser?.close().catch(() => { });
    this.browser = null;
    this.context = null;
    this.page = null;
  }
}
