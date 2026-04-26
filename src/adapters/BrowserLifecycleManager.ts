import { chromium, Browser, BrowserContext, Page } from "playwright";
import { ILogger } from "../core/ports/ILogger";
import { BROWSER_MASK_CONFIG, DEFAULT_ACTION_TIMEOUT_MS } from "../core/config/index";
import { FeatureFlags } from "../core/features";
import { RealisticFingerprintProvider } from "./RealisticFingerprintProvider";
import { SessionState } from "../core/ports/ISessionManager";

export class BrowserLifecycleManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private readonly fingerprintProvider = new RealisticFingerprintProvider();

  // 请求/响应捕获监听器存储（供外部注入）
  private requestHandler?: (req: any) => void;
  private responseHandler?: (res: any) => void;

  constructor(private readonly logger: ILogger) { }

  /**
   * 注册网络请求/响应监听器（在页面加载前调用）
   */
  setNetworkHandlers(
    onRequest?: (req: any) => void,
    onResponse?: (res: any) => void
  ) {
    this.requestHandler = onRequest;
    this.responseHandler = onResponse;
  }

  async launch(
    url: string,
    headless = true,
    sessionState?: SessionState
  ): Promise<Page> {
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
    const contextOpts: any = {
      viewport: fp.viewport,
      locale: fp.locale,
      extraHTTPHeaders: { "Accept-Language": fp.acceptLanguage },
    };

    if (FeatureFlags.enableDynamicFingerprint) {
      contextOpts.userAgent = fp.userAgent;
      contextOpts.platform = fp.platform;
    }

    this.context = await this.browser.newContext(contextOpts);
    this.page = await this.context.newPage();

    // 反检测脚本（必须在页面加载前注入）
    await this.page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      Object.defineProperty(navigator, "plugins", { get: () => [] });
      Object.defineProperty(navigator, "platform", { get: () => "Win32" });
    });

    // 提前注册网络监听器（关键修复点）
    if (this.requestHandler) {
      this.page.on("request", this.requestHandler);
    }
    if (this.responseHandler) {
      this.page.on("response", this.responseHandler);
    }

    // 加载持久化会话
    if (sessionState && this.context) {
      const safeCookies = sessionState.cookies.map((c) => ({
        ...c,
        sameSite: c.sameSite as "Strict" | "Lax" | "None" | undefined,
      }));
      await this.context.addCookies(safeCookies);

      if (this.page) {
        await this.page.evaluate(
          ({ localData, sessionData }: { localData: Record<string, string>; sessionData: Record<string, string> }) => {
            localStorage.clear();
            sessionStorage.clear();
            Object.entries(localData).forEach(([k, v]) => localStorage.setItem(k, v));
            Object.entries(sessionData).forEach(([k, v]) => sessionStorage.setItem(k, v));
          },
          { localData: sessionState.localStorage, sessionData: sessionState.sessionStorage }
        );
      }

      this.logger.info(`✅ 已加载会话：Cookie(${sessionState.cookies.length})`);
    }

    this.page.setDefaultTimeout(DEFAULT_ACTION_TIMEOUT_MS);
    await this.page.goto(url, {
      waitUntil: "networkidle",
      timeout: DEFAULT_ACTION_TIMEOUT_MS,
    });
    this.logger.info("页面加载完成", { url });
    return this.page;
  }

  getPage(): Page {
    if (!this.page) throw new Error("Page not initialized");
    return this.page;
  }

  async close(): Promise<void> {
    try {
      await this.page?.close().catch(() => { });
      await this.context?.close().catch(() => { });
      await this.browser?.close().catch(() => { });
    } finally {
      this.browser = null;
      this.context = null;
      this.page = null;
      this.logger.debug("浏览器资源已回收");
    }
  }
}