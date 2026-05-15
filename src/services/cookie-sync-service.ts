import * as BrowserPool from "../utils/BrowserPool";
import { ConsoleLogger } from "../adapters/ConsoleLogger";
import { FileSessionManager } from "../adapters/FileSessionManager";

const CDP_SITE_KEY = "__cdp__";

/**
 * 默认待同步的站点列表。
 * key = 域名标识（session profile 的 domain 部分）
 * value = 用于 Playwright cookies API 的 URL
 */
const DEFAULT_SITES: Record<string, string> = {
  bilibili: "https://www.bilibili.com",
  xiaohongshu: "https://www.xiaohongshu.com",
  zhihu: "https://www.zhihu.com",
  xueshu: "https://xueshu.baidu.com",
};

/**
 * 各站点关键的 Cookie 字段名。
 * 同步后若缺失这些字段之一，记录告警以便排查。
 */
const CRITICAL_COOKIES: Record<string, string[]> = {
  xiaohongshu: ["a1", "web_session", "webId", "gid"],
  bilibili: ["buvid3", "buvid4", "b_lsid", "SESSDATA"],
  zhihu: ["z_c0", "d_c0"],
};

export interface CookieSyncConfig {
  /** 待同步的站点列表。key=域名标识, value=用于获取 Cookie 的任意 URL */
  sites?: Record<string, string>;
  /** 写入的账号 ID，默认 "main" */
  accountId?: string;
}

/**
 * Cookie 同步服务。
 *
 * 从 CDP 连接的 Chrome 浏览器中提取目标站点的所有 Cookie，
 * 写入 FileSessionManager，使 API 直连环路也能使用最新登录态。
 */
export class CookieSyncService {
  private logger: ConsoleLogger;
  private sessionManager: FileSessionManager;
  private config: Required<CookieSyncConfig>;

  constructor(
    sessionManager?: FileSessionManager,
    config?: CookieSyncConfig,
    logger?: ConsoleLogger,
  ) {
    this.logger = logger ?? new ConsoleLogger("info");
    this.sessionManager = sessionManager ?? new FileSessionManager();
    this.config = {
      sites: config?.sites ?? DEFAULT_SITES,
      accountId: config?.accountId ?? "main",
    };
  }

  /**
   * 从 CDP 连接的 Chrome 中提取 Cookie 并同步到 FileSessionManager。
   * @param merge 合并模式：保留已有 Cookie 中未出现在新数据中的条目（如 a1）
   * @returns 成功同步的站点名数组
   */
  async syncFromCDPToSessions(merge = true): Promise<string[]> {
    // 1. 获取 CDP 浏览器
    const cdpEntry = BrowserPool.getPoolEntry(CDP_SITE_KEY);
    if (!cdpEntry) {
      this.logger.warn("CDP 浏览器不可用（未注册），Cookie 同步跳过");
      return [];
    }

    const context = cdpEntry.context;
    const synced: string[] = [];

    for (const [domain, url] of Object.entries(this.config.sites)) {
      try {
        const cookies = await context.cookies(url);
        if (!cookies || cookies.length === 0) {
          this.logger.info(`  ${domain}: 无 Cookie，跳过`);
          continue;
        }

        // 过滤过期 / session 类无关 cookie
        const validCookies = cookies.filter((c) => {
          if (c.expires && c.expires <= Math.floor(Date.now() / 1000)) return false;
          return true;
        });

        if (validCookies.length === 0) {
          this.logger.info(`  ${domain}: Cookie 已全部过期`);
          continue;
        }

        // 读取已有 session 保留 localStorage 等非 cookie 字段
        const profileName = `${domain}:${this.config.accountId}`;
        const existing = await this.sessionManager.load(profileName);

        const state = existing || {
          cookies: [] as any[],
          localStorage: {} as Record<string, string>,
          sessionStorage: {} as Record<string, string>,
          createdAt: Date.now(),
          lastUsedAt: Date.now(),
        };

        // Playwright Cookie → 项目的 SessionState cookie 格式
        state.cookies = validCookies.map((c) => ({
          name: c.name,
          value: c.value,
          domain: c.domain || `.${domain}`,
          path: c.path || "/",
          secure: c.secure ?? false,
          httpOnly: c.httpOnly ?? false,
          sameSite: c.sameSite || "Lax",
        }));
        state.lastUsedAt = Date.now();

        // 关键 Cookie 缺失告警
        this.warnMissingCriticalCookies(domain, validCookies);

        await this.sessionManager.save(profileName, state, merge);
        this.logger.info(`  ✅ ${domain}: 已同步 ${validCookies.length} 个 Cookie (${validCookies[0]?.name}...)${merge ? " [合并]" : ""}`);
        synced.push(domain);
      } catch (e) {
        this.logger.warn(`  ⚠️ ${domain}: 同步失败 — ${(e as Error).message}`);
      }
    }

    if (synced.length > 0) {
      this.logger.info(`🎉 Cookie 同步完成: ${synced.join(", ")}`);
    } else {
      this.logger.info("😴 Cookie 同步: 无可同步的站点");
    }

    return synced;
  }

  /**
   * 检查同步后的 cookie 是否缺少关键字段。
   */
  private warnMissingCriticalCookies(domain: string, cookies: Array<{ name: string }>): void {
    const critical = CRITICAL_COOKIES[domain];
    if (!critical || critical.length === 0) return;

    const names = new Set(cookies.map((c) => c.name));
    const missing = critical.filter((name) => !names.has(name));
    if (missing.length > 0) {
      this.logger.warn(`  ⚠️ ${domain}: 可能缺少关键 Cookie — ${missing.join(", ")}`);
    }
  }
}
