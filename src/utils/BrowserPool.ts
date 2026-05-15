import { chromium, Browser, BrowserContext, Page } from "playwright";
import { injectAntiDetection } from "../browser/anti-detection-injector";

/** 页面池死锁错误：所有页面都在 waiting 状态，无法获取新页面。 */
export class PoolDeadlockError extends Error {
  constructor(browserId: string, maxPages: number, waiting: number) {
    super(
      `Browser [${browserId}] 页面池死锁: max=${maxPages}, waiting=${waiting}, 所有页面均处于验证码等待状态`,
    );
    this.name = "PoolDeadlockError";
  }
}

interface PoolEntry {
  browser: Browser;
  context: BrowserContext;
  createdAt: number;
  lastUsedAt: number;
}

/** 每个 browserId 的 Page 池 */
interface PagePoolState {
  /** 当前已分配的 Page 数（含 waiting） */
  acquired: number;
  /** 空闲可复用的 Page */
  idle: Page[];
  /** 最大 Page 数 */
  maxPages: number;
  /** 等待用户操作的 Page 数（不计入可用并发） */
  waiting: Set<Page>;
  /** 紧急溢出的 Page（超出 maxPages 临时创建），释放时直接关闭 */
  overflow: Set<Page>;
}

const pool = new Map<string, PoolEntry>();
const pagePools = new Map<string, PagePoolState>();
const DEFAULT_MAX_PAGES = 3;
const ACQUIRE_WAIT_TIMEOUT_MS = 30000;
const DEADLOCK_DETECT_MS = 15000;
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

/** 获取指定站点的完整池条目（browser + context）。 */
export function getPoolEntry(site: string): { browser: Browser; context: BrowserContext } | undefined {
  const entry = pool.get(site);
  if (!entry) return undefined;
  return { browser: entry.browser, context: entry.context };
}

// ── Page 池 ──

/** 设置某个 browserId 的最大 Page 并发数。 */
export function setMaxPagesPerBrowser(browserId: string, max: number): void {
  let ps = pagePools.get(browserId);
  if (!ps) {
    ps = { acquired: 0, idle: [], maxPages: max, waiting: new Set(), overflow: new Set() };
    pagePools.set(browserId, ps);
  } else {
    ps.maxPages = max;
  }
}

/** 标记 Page 为等待用户操作状态。释放并发计数供其他任务使用。 */
export function markPageWaiting(page: Page, browserId: string): void {
  const ps = pagePools.get(browserId);
  if (!ps) return;
  ps.waiting.add(page);
  ps.acquired--;
}

/** 标记 Page 结束等待，恢复为已占用状态。 */
export function markPageActive(page: Page, browserId: string): void {
  const ps = pagePools.get(browserId);
  if (!ps) return;
  ps.waiting.delete(page);
  ps.acquired++;
}

/** 获取指定 browser 的等待中 Page 数量。 */
export function waitingCount(browserId: string): number {
  const ps = pagePools.get(browserId);
  return ps ? ps.waiting.size : 0;
}

/**
 * 从指定 browserId 的上下文中获取一个 Page。
 * 优先复用空闲 Page → 未达上限则创建新 Page → 等待。
 *
 * 死锁保护：
 * - 等待 15s 后若所有非空闲 Page 均处于 waiting 状态 → 抛出 PoolDeadlockError
 * - 等待超时 30s 后若仍无空闲页 → 创建紧急溢出 Page（临时超出 maxPages，最多 1 个额外）
 */
export async function acquirePage(browserId: string, _url?: string): Promise<Page> {
  const entry = pool.get(browserId);
  if (!entry?.context) {
    throw new Error(`Browser [${browserId}] 未注册到池中`);
  }

  let ps = pagePools.get(browserId);
  if (!ps) {
    ps = { acquired: 0, idle: [], maxPages: DEFAULT_MAX_PAGES, waiting: new Set(), overflow: new Set() };
    pagePools.set(browserId, ps);
  }

  // 1. 优先复用空闲 Page
  if (ps.idle.length > 0) {
    const page = ps.idle.pop()!;
    ps.acquired++;
    await injectAntiDetection(page);
    return page;
  }

  // 2. 未达上限 → 创建新 Page
  if (ps.acquired < ps.maxPages) {
    const page = await entry.context.newPage();
    await injectAntiDetection(page);
    ps.acquired++;
    return page;
  }

  // 3. 已达上限 → 轮询等待
  const startWait = Date.now();
  const deadline = startWait + ACQUIRE_WAIT_TIMEOUT_MS;
  let deadlockLogged = false;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 200));

    // 3a. 有空闲页 → 复用
    if (ps.idle.length > 0) {
      const page = ps.idle.pop()!;
      ps.acquired++;
      await injectAntiDetection(page);
      return page;
    }

    // 3b. 死锁检测：所有非空闲 Page 都在 waiting 状态
    const elapsed = Date.now() - startWait;
    if (!deadlockLogged && elapsed > DEADLOCK_DETECT_MS && ps.waiting.size > 0) {
      const totalActive = ps.acquired + ps.waiting.size;
      if (ps.waiting.size >= totalActive) {
        deadlockLogged = true;
        // 抛出错误让调用方降级
        throw new PoolDeadlockError(browserId, ps.maxPages, ps.waiting.size);
      }
    }
  }

  // 3c. 等待超时：创建紧急溢出 Page（最多 1 个额外）
  if (ps.overflow.size === 0) {
    const page = await entry.context.newPage();
    await injectAntiDetection(page);
    ps.overflow.add(page);
    ps.acquired++;
    return page;
  }

  throw new PoolDeadlockError(browserId, ps.maxPages, ps.waiting.size);
}

/**
 * 释放 page 回空闲池。不关闭页面，仅标记为空闲。
 * overflow 页面直接关闭；空闲池已满（超过 maxPages）也关闭。
 */
export async function releasePage(page: Page, browserId: string): Promise<void> {
  const ps = pagePools.get(browserId);
  if (!ps) {
    await page.close().catch(() => {});
    return;
  }

  ps.acquired--;

  // overflow 页面：直接关闭
  if (ps.overflow.has(page)) {
    ps.overflow.delete(page);
    await page.close().catch(() => {});
    return;
  }

  // 从 waiting 集合移除（如尚未被 markPageActive 调用）
  ps.waiting.delete(page);

  if (ps.idle.length < ps.maxPages) {
    ps.idle.push(page);
  } else {
    await page.close().catch(() => {});
  }
}
