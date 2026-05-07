import { chromium, Browser, BrowserContext } from "playwright";

interface PoolEntry {
  browser: Browser;
  context: BrowserContext;
  createdAt: number;
  lastUsedAt: number;
}

const pool = new Map<string, PoolEntry>();
let cleanupTimer: ReturnType<typeof setInterval> | null = null;
let idleTimeoutMs = 300000;
let factory: ((site: string) => Promise<{ browser: Browser; context: BrowserContext }>) | null = null;

function getDefaultFactory() {
  return async (_site: string) => {
    const browser = await chromium.launch({
      headless: true,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-default-browser-check",
        "--no-first-run",
        "--disable-dev-shm-usage",
      ],
    });
    const context = await browser.newContext();
    return { browser, context };
  };
}

/** 注册自定义 browser 工厂（供 BaseCrawler 传入配置参数）。 */
export function setBrowserFactory(fn: (site: string) => Promise<{ browser: Browser; context: BrowserContext }>): void {
  factory = fn;
}

/** 配置空闲超时。 */
export function setIdleTimeout(ms: number): void {
  idleTimeoutMs = ms;
}

/** 获取或创建该站点的 Browser。 */
export async function getBrowser(site: string): Promise<{ browser: Browser; context: BrowserContext }> {
  const existing = pool.get(site);
  if (existing) {
    existing.lastUsedAt = Date.now();
    return { browser: existing.browser, context: existing.context };
  }
  const fn = factory || getDefaultFactory();
  const { browser, context } = await fn(site);
  pool.set(site, { browser, context, createdAt: Date.now(), lastUsedAt: Date.now() });
  startCleanupTimer();
  return { browser, context };
}

/** 释放该站点的 Browser（不关闭，供后续复用）。 */
export function releaseBrowser(site: string): void {
  const entry = pool.get(site);
  if (entry) entry.lastUsedAt = Date.now();
}

/** 启动空闲清理定时器（每 60s）。 */
function startCleanupTimer(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [site, entry] of pool) {
      if (now - entry.lastUsedAt > idleTimeoutMs) {
        entry.browser.close().catch(() => {});
        pool.delete(site);
      }
    }
    if (pool.size === 0 && cleanupTimer) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    }
  }, 60000);
}

/** 关闭所有浏览器。 */
export async function destroyAll(): Promise<void> {
  if (cleanupTimer) { clearInterval(cleanupTimer); cleanupTimer = null; }
  for (const [, entry] of pool) {
    await entry.browser.close().catch(() => {});
  }
  pool.clear();
}

/** 当前池大小。 */
export function poolSize(): number { return pool.size; }

/** 获取所有站点名。 */
export function poolSites(): string[] { return [...pool.keys()]; }

/** 直接设置池条目（供 ChromeService CDP 注册使用）。 */
export function setPoolEntry(site: string, browser: Browser, context: BrowserContext, lastUsedAt?: number): void {
  pool.set(site, { browser, context, createdAt: Date.now(), lastUsedAt: lastUsedAt ?? Date.now() });
}

/** 删除指定站点的池条目。 */
export function deletePoolEntry(site: string): void {
  pool.delete(site);
}

/** 获取指定站点池条目的 lastUsedAt 时间戳。 */
export function getPoolEntryLastUsed(site: string): number | undefined {
  return pool.get(site)?.lastUsedAt;
}
