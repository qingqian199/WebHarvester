import { IBrowserAdapter } from "../core/ports/IBrowserAdapter";
import { ILogger } from "../core/ports/ILogger";
import { SessionState } from "../core/ports/ISessionManager";
import { HarvestConfig, NetworkRequest, ElementItem, StorageSnapshot } from "../core/models";
import { BrowserLifecycleManager } from "./BrowserLifecycleManager";
import { randomDelay } from "../utils/human-behavior";
import { BROWSER_MASK_CONFIG } from "../core/config";
import { REQUEST_CAPTURE_EXTRA_WAIT_MS } from "../core/constants/GlobalConstant";

export class PlaywrightAdapter implements IBrowserAdapter {
  private readonly lcm: BrowserLifecycleManager;

  constructor(private readonly logger: ILogger) {
    this.lcm = new BrowserLifecycleManager(logger);
  }

  async launch(url: string, sessionState?: SessionState): Promise<void> {
    await this.lcm.launch(url, true, sessionState, "networkidle");
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
  }): Promise<NetworkRequest[]> {
    const page = this.lcm.getPage();
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => { });
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
      } catch (e) {
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
  }
}
