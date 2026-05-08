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

  async captureNetworkRequests(config: {
    captureAll: boolean;
    enhancedFullCapture?: boolean;
  }): Promise<NetworkRequest[]> {
    const page = this.lcm.getPage();
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

    // 增强模式：尝试点击展开/加载更多按钮 + 滚动触发懒加载
    if (config.enhancedFullCapture) {
      try {
        // 第1步：尝试批量点击常见的"展开/加载更多"按钮
        const expandSelectors = [
          "text=展开", "text=加载更多", "text=查看全部", "text=查看更多回复",
          "text=展开回复", "text=查看更多评论", "text=显示更多",
          ".load-more", ".load-more-comments", ".comment-expand",
          ".see-more", ".view-more", ".expand-btn", ".expand-button",
          "[class*=load-]", "[class*=loadmore]", "[class*=expand]",
        ];
        for (const sel of expandSelectors) {
          try {
            const btns = await page.$$(sel);
            for (const btn of btns) {
              const box = await btn.boundingBox();
              if (!box || box.width < 5 || box.height < 5) continue;
              await btn.click({ timeout: 1000 }).catch(() => {});
              await new Promise((r) => setTimeout(r, 200 + Math.floor(Math.random() * 150)));
            }
          } catch { /* 选择器无匹配跳过 */ }
        }
        await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});

        // 第2步：模拟页面滚动触发懒加载
        await page.evaluate(async () => {
          const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
          for (let i = 0; i < 15; i++) {
            const currentHeight = document.body.scrollHeight;
            window.scrollTo(0, currentHeight);
            await delay(800 + Math.floor(Math.random() * 400));
            const newHeight = document.body.scrollHeight;
            if (newHeight <= currentHeight) {
              // 没有新内容加载，等待一次后退出
              await delay(500);
              break;
            }
          }
          window.scrollTo(0, 0);
        }).catch(() => {});

        // 第3步：滚动后再尝试点击可能新出现的展开按钮
        for (const sel of [
          "text=加载更多", "text=展开回复", "text=查看更多回复",
          ".load-more", ".comment-expand",
        ]) {
          try {
            const btns = await page.$$(sel);
            for (const btn of btns) {
              const box = await btn.boundingBox();
              if (!box || box.width < 5 || box.height < 5) continue;
              await btn.click({ timeout: 1000 }).catch(() => {});
              await new Promise((r) => setTimeout(r, 300));
            }
          } catch { /* skip */ }
        }
        await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
      } catch {
        // 增强交互失败不影响主流程
      }
    }

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

  /** 获取页面诊断数据（console 消息 + JS 错误）。 */
  getPageDiagnostics(): { consoleMessages: Array<{ type: string; text: string }>; pageErrors: Array<{ message: string; stack?: string }> } {
    return this.lcm.getPageDiagnostics();
  }

  async close(): Promise<void> {
    await this.lcm.close();
    if (this.poolSite) releaseBrowser(this.poolSite);
  }
}
