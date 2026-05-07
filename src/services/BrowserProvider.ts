import { chromium, Browser, BrowserContext } from "playwright";
import { ConsoleLogger } from "../adapters/ConsoleLogger";
import * as BrowserPool from "../utils/BrowserPool";

const CDP_SITE_KEY = "__cdp__";
const CDP_BROWSER_TIMEOUT = 15000;
const logger = new ConsoleLogger("info");

export interface BrowserInstance {
  browser: Browser;
  context: BrowserContext;
  isCDP: boolean;
}

let cdpBrowser: Browser | null = null;
let cdpContext: BrowserContext | null = null;

/**
 * 注册 CDP 浏览器实例到 BrowserPool。
 * 由 index.ts 启动 ChromeService 后调用。
 */
export async function registerCdpBrowser(port: number): Promise<void> {
  try {
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: CDP_BROWSER_TIMEOUT });
    const context = browser.contexts()[0];
    cdpBrowser = browser;
    cdpContext = context;

    BrowserPool.setPoolEntry(CDP_SITE_KEY, browser, context, Infinity);
    logger.info(`CDP 浏览器已注册 (端口 ${port})`);
  } catch (e) {
    logger.warn(`CDP 浏览器注册失败: ${(e as Error).message}`);
    throw e;
  }
}

/**
 * 获取浏览器实例。
 * 当 enableChromeService 为 true 时，优先返回 CDP 连接；
 * 否则从 BrowserPool 获取或自启动。
 */
export async function getBrowser(site: string, preferCDP = false): Promise<BrowserInstance> {
  if (preferCDP && cdpBrowser && cdpContext) {
    const lastUsed = BrowserPool.getPoolEntryLastUsed(CDP_SITE_KEY);
    if (lastUsed !== undefined && lastUsed !== Infinity) {
      BrowserPool.setPoolEntry(CDP_SITE_KEY, cdpBrowser, cdpContext, Date.now());
    }
    return { browser: cdpBrowser, context: cdpContext, isCDP: true };
  }

  const poolEntry = await BrowserPool.getBrowser(site);
  return { ...poolEntry, isCDP: false };
}

/**
 * 注销 CDP 浏览器（停止 ChromeService 时调用）。
 */
export async function unregisterCdpBrowser(): Promise<void> {
  BrowserPool.deletePoolEntry(CDP_SITE_KEY);
  if (cdpBrowser) {
    try { await cdpBrowser.close(); } catch {}
    cdpBrowser = null;
    cdpContext = null;
  }
}
