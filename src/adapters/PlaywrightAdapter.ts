import { chromium } from "playwright";
import { IBrowserAdapter } from "../core/ports/IBrowserAdapter";
import { ILogger } from "../core/ports/ILogger";
import { SessionState } from "../core/ports/ISessionManager";
import { HarvestConfig, NetworkRequest, ElementItem, StorageSnapshot } from "../core/models";
import { BrowserLifecycleManager } from "./BrowserLifecycleManager";
import { randomDelay } from "../utils/human-behavior";
import { BROWSER_MASK_CONFIG } from "../core/config";
import { REQUEST_CAPTURE_EXTRA_WAIT_MS } from "../core/constants/GlobalConstant";
import { releaseBrowser } from "../utils/BrowserPool";

export class PlaywrightAdapter implements IBrowserAdapter {
  private readonly lcm: BrowserLifecycleManager;
  private poolSite = "";
  /** 是否通过 CDP 连接到已有 Chrome 实例（跳过 launch）。 */
  private _cdpAttached = false;

  constructor(private readonly logger: ILogger) {
    this.lcm = new BrowserLifecycleManager(logger);
  }

  /** 启动浏览器并导航到 URL。可选的 pageSetup 回调在页面创建后、导航前调用。 */
  async launch(url: string, sessionState?: SessionState, proxyUrl?: string, pageSetup?: (page: any) => Promise<void>, enableFullCapture?: boolean, captureAllTypes?: boolean): Promise<void> {
    // CDP 连接模式：浏览器已就绪
    if (this._cdpAttached) {
      if (enableFullCapture || captureAllTypes) {
        this.lcm.disableNetworkCapture();
        this.lcm.startNetworkCapture(enableFullCapture, captureAllTypes);
      }
      const extraWait = enableFullCapture || captureAllTypes
        ? REQUEST_CAPTURE_EXTRA_WAIT_MS
        : 1000;
      await new Promise((r) => setTimeout(r, extraWait));
      return;
    }
    await this.lcm.launch(url, true, sessionState, "domcontentloaded", undefined, proxyUrl, pageSetup, enableFullCapture, captureAllTypes);
  }

  /** 连接到 ChromeService 管理的已有 Chrome 实例 (CDP)。返回新的 PlaywrightAdapter。 */
  static async connectToChromeService(port: number, url: string, logger: ILogger, sessionState?: SessionState, pageSetup?: (page: any) => Promise<void>): Promise<PlaywrightAdapter> {
    const adapter = new PlaywrightAdapter(logger);
    adapter._cdpAttached = true;
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 15000 });
    const context = browser.contexts()[0] || await browser.newContext();
    await adapter.lcm.attachToContext(context, url, sessionState, pageSetup);
    adapter._injectCdpBrowser(browser);
    return adapter;
  }

  /** 注入 CDP 浏览器实例引用（供关闭时使用）。 */
  private _injectCdpBrowser(browser: any): void {
    this.lcm.setBrowser(browser);
  }

  /** 从已存在的 Browser Context 创建页面（浏览器池复用）。 */
  async attachToContext(context: any, url: string, sessionState?: SessionState, pageSetup?: (page: any) => Promise<void>, site?: string): Promise<void> {
    this.poolSite = site || "";
    await this.lcm.attachToContext(context, url, sessionState, pageSetup);
  }

  async performActions(actions: HarvestConfig["actions"]): Promise<void> {
    if (!actions?.length) return;
    const page = this.lcm.getPage();
    const { minDelayMs, maxDelayMs } = BROWSER_MASK_CONFIG;

    for (const act of actions) {
      await randomDelay(minDelayMs, maxDelayMs);
      try {
        switch (act.type) {
          case "click":
            if (act.selector) await page.click(act.selector);
            break;
          case "input":
            if (act.selector && act.value) await page.fill(act.selector, act.value);
            break;
          case "wait":
            await page.waitForTimeout(act.waitTime ?? 1000);
            break;
          case "navigate":
            if (act.value) await page.goto(act.value, { waitUntil: "networkidle" });
            break;
        }
      } catch (e) {
        this.logger.warn("操作执行失败", {
          selector: act.selector,
          err: (e as Error).message,
        });
      }
    }
  }

  async captureNetworkRequests(_config: {
    captureAll: boolean;
    enhancedFullCapture?: boolean;
  }): Promise<NetworkRequest[]> {
    const page = this.lcm.getPage();
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, REQUEST_CAPTURE_EXTRA_WAIT_MS));
    return this.lcm.getCapturedRequests();
  }

  async queryElements(selectors: string[]): Promise<ElementItem[]> {
    const page = this.lcm.getPage();
    const res: ElementItem[] = [];
    for (const s of selectors) {
      try {
        const els = await page.$$eval(s, (nodes) =>
          nodes.map((n) => ({
            tagName: n.tagName.toLowerCase(),
            attributes: Object.fromEntries(
              [...n.attributes].map((a) => [a.name, a.value]),
            ),
            text: n.textContent?.trim(),
          })),
        );
        els.forEach((item) => res.push({ selector: s, ...item }));
      } catch {
        this.logger.warn("元素查询失败", { selector: s });
      }
    }
    return res;
  }

  async getStorage(
    types: Array<"localStorage" | "sessionStorage" | "cookies">,
  ): Promise<StorageSnapshot> {
    const page = this.lcm.getPage();
    const ctx = page.context();
    const storage: StorageSnapshot = {
      localStorage: {},
      sessionStorage: {},
      cookies: [],
    };

    if (types.includes("localStorage")) {
      try {
        storage.localStorage = await page.evaluate(() =>
          JSON.parse(JSON.stringify(window.localStorage)),
        );
      } catch {
        this.logger.warn("无法读取 localStorage，可能为受限页面");
      }
    }
    if (types.includes("sessionStorage")) {
      try {
        storage.sessionStorage = await page.evaluate(() =>
          JSON.parse(JSON.stringify(window.sessionStorage)),
        );
      } catch {
        this.logger.warn("无法读取 sessionStorage，可能为受限页面");
      }
    }
    if (types.includes("cookies")) {
      storage.cookies = await ctx.cookies();
    }
    return storage;
  }

  async executeScript<T>(script: string): Promise<T> {
    const page = this.lcm.getPage();
    return page.evaluate(script);
  }

  getPageMetrics() {
    return this.lcm.getPageMetrics();
  }

  async close(): Promise<void> {
    await this.lcm.close();
    if (this.poolSite) releaseBrowser(this.poolSite);
  }
}
