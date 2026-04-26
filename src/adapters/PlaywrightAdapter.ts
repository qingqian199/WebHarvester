import { IBrowserAdapter } from "../core/ports/IBrowserAdapter";
import { ILogger } from "../core/ports/ILogger";
import { SessionState } from "../core/ports/ISessionManager";
import { HarvestConfig, NetworkRequest, ElementItem, StorageSnapshot } from "../core/models";
import { BrowserLifecycleManager } from "./BrowserLifecycleManager";
import { randomDelay } from "../utils/human-behavior";
import { BROWSER_MASK_CONFIG } from "../core/config";

export class PlaywrightAdapter implements IBrowserAdapter {
  private readonly lcm: BrowserLifecycleManager;
  private capturedRequests: Map<string, NetworkRequest> = new Map();

  constructor(private readonly logger: ILogger) {
    this.lcm = new BrowserLifecycleManager(logger);
    this.setupNetworkCapture();
  }

  private setupNetworkCapture(): void {
    const onRequest = (req: any) => {
      const url = req.url();
      const method = req.method();
      const reqHeaders = req.headers();
      const networkReq: NetworkRequest = {
        url,
        method,
        statusCode: 0,
        requestHeaders: reqHeaders,
        requestBody: req.postData(),
        timestamp: Date.now(),
      };
      this.capturedRequests.set(url + method, networkReq);
      this.logger.debug(`[请求捕获] ${method} ${url}`, { url, method });
    };

    const onResponse = async (res: any) => {
      const url = res.url();
      const method = res.request().method();
      const key = url + method;
      const existing = this.capturedRequests.get(key);
      if (existing) {
        existing.statusCode = res.status();
        try {
          if (['xhr', 'fetch'].includes(res.request().resourceType())) {
            const body = await res.text().catch(() => null);
            existing.responseBody = body;
          }
        } catch (e) {
          this.logger.warn("无法读取响应体", { url });
        }
      }
      this.logger.debug(`[响应捕获] ${res.status()} ${url}`);
    };

    this.lcm.setNetworkHandlers(onRequest, onResponse);
  }

  async launch(url: string, sessionState?: SessionState): Promise<void> {
    this.capturedRequests.clear();
    await this.lcm.launch(url, true, sessionState);
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
        this.logger.warn("操作执行失败", { selector: act.selector, err: (e as Error).message });
      }
    }
  }

  async captureNetworkRequests(config: { captureAll: boolean }): Promise<NetworkRequest[]> {
    const page = this.lcm.getPage();
    await page.waitForTimeout(2000); // 额外等待 2 秒确保异步请求完成
    const list = Array.from(this.capturedRequests.values());
    this.logger.info(`网络捕获完成，共 ${list.length} 条请求`);
    return list;
  }

  async queryElements(selectors: string[]): Promise<ElementItem[]> {
    const page = this.lcm.getPage();
    const res: ElementItem[] = [];

    // 关键修复1：确保网络空闲，页面和动态内容加载完成
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(e => {
      this.logger.warn('等待页面网络空闲超时，尝试继续查询元素');
    });
    // 额外等待一小段时间，确保Vue/React完成渲染
    await page.waitForTimeout(1500);

    for (const s of selectors) {
      try {
        // 如果选择器是通用表单元素，直接查询
        let elementSelector = s;
        if (['input', 'form', 'button', 'textarea', 'select'].includes(s)) {
          elementSelector = s;
        }

        // 尝试等待选择器出现
        await page.waitForSelector(elementSelector, { timeout: 5000 }).catch(() => {
          this.logger.warn(`元素选择器未出现: ${s}，将尝试全页查找`);
          return null;
        });

        const els = await page.$$eval(elementSelector, nodes =>
          nodes.map(n => ({
            tagName: n.tagName.toLowerCase(),
            attributes: Object.fromEntries([...n.attributes].map(a => [a.name, a.value])),
            text: n.textContent?.trim(),
          }))
        );
        els.forEach(item => res.push({ selector: s, ...item }));
      } catch (e) {
        this.logger.error(`元素查询失败: ${s}`, { error: (e as Error).message });
      }
    }
    this.logger.info(`元素查询完成，共找到 ${res.length} 个元素`);
    return res;
  }

  async getStorage(types: Array<"localStorage" | "sessionStorage" | "cookies">): Promise<StorageSnapshot> {
    const page = this.lcm.getPage();
    const ctx = page.context();
    const storage: StorageSnapshot = { localStorage: {}, sessionStorage: {}, cookies: [] };

    if (types.includes("localStorage")) {
      storage.localStorage = await page.evaluate(() => JSON.parse(JSON.stringify(window.localStorage)));
    }
    if (types.includes("sessionStorage")) {
      storage.sessionStorage = await page.evaluate(() => JSON.parse(JSON.stringify(window.sessionStorage)));
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

  async close(): Promise<void> {
    await this.lcm.close();
  }
}