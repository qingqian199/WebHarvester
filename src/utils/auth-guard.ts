import { Page, BrowserContext } from "playwright";
import { BrowserLifecycleManager } from "../adapters/BrowserLifecycleManager";
import { FileSessionManager } from "../adapters/FileSessionManager";
import { ILogger } from "../core/ports/ILogger";
import { SessionState } from "../core/ports/ISessionManager";
import { ConsoleLogger } from "../adapters/ConsoleLogger";
import { captureSessionFromPage } from "./session-helper";
import {
  SESSION_VALIDATE_TIMEOUT_MS,
  MANUAL_LOGIN_TIMEOUT_MS,
  LOGIN_SUCCESS_POLL_MS,
  PAGE_LOAD_FALLBACK_TIMEOUT_MS,
} from "../core/constants/GlobalConstant";

export interface AuthConfig {
  loginUrl?: string;
  verifyUrl?: string;
  /** 自定义登录成功选择器（优先级最高） */
  loggedInSelector?: string;
  /** 自定义未登录选择器 */
  loggedOutSelector?: string;
  /** 登录成功后期望跳转的 URL 片段（如不包含 "login" 即视为成功） */
  successUrlPattern?: string;
  /** 需检查的鉴权 Cookie 关键词 */
  cookieCheckWords?: string[];
}

const DEFAULT_COOKIE_KEYWORDS = ["session", "token", "auth", "sid", "jwt"];
const NO_LOGIN_SELECTORS = [
  "a[href*=\"login\"], button[class*=\"login\"], .login-btn, .header-login-btn",
  "[class*=\"header\"] [class*=\"login\"]",
  ".bili-header__bar-login-btn, .unlogin",
];
const LOGGED_IN_SELECTORS = [
  ".user-avatar", ".header-user-avatar", ".user-name",
  ".user-info", ".profile", ".logout",
  "[class*=\"user-center\"]", "[class*=\"logged-in\"]",
];

/** 登录态守卫。管理会话的加载、验证和刷新流程。 */
export class AuthGuard {
  private logger: ILogger;

  constructor(
    private sessionManager: FileSessionManager,
    private authConfig: AuthConfig = {},
    logger?: ILogger,
  ) {
    this.logger = logger ?? new ConsoleLogger();
  }

  /**
   * 确保指定 profile 存在有效登录态。
   * 优先加载已有会话并验证有效性；失效或不存在时打开浏览器等待手动登录。
   * @returns 可用的 SessionState，失败返回 null。
   */
  async ensureAuth(profile: string, targetLoginUrl: string, targetVerifyUrl: string): Promise<SessionState | null> {
    const loginUrl = this.authConfig.loginUrl || targetLoginUrl;
    const verifyUrl = this.authConfig.verifyUrl || targetVerifyUrl;

    const session = await this.sessionManager.load(profile);
    if (session) {
      this.logger.info(`📂 已找到会话文件 ${profile}，正在验证有效性...`);
      const isValid = await this.verifySession(session, verifyUrl);
      if (isValid) {
        this.logger.info("✅ 会话有效，跳过登录");
        return session;
      }
      this.logger.warn("⚠️ 会话已失效，需要重新登录");
      await this.sessionManager.deleteProfile(profile);
    }

    this.logger.info("🔓 正在启动有头浏览器，请手动登录...");
    return await this.manualLogin(loginUrl, verifyUrl, profile);
  }

  // ── 多维登录检测 ──────────────────────────────────────

  /**
   * 组合策略验证登录态。
   * 优先级：自定义选择器 → Cookie 检测 → URL 跳转 → 通用元素检测
   */
  private async verifyLoginState(page: Page, verifyUrl: string): Promise<boolean> {
    if (this.authConfig.loggedInSelector) {
      return (await page.$(this.authConfig.loggedInSelector)) !== null;
    }
    if (this.authConfig.loggedOutSelector) {
      return (await page.$(this.authConfig.loggedOutSelector)) === null;
    }
    if (await this.isLoggedInByElement(page)) return true;
    if (await hasValidAuthCookie(page.context(), this.authConfig.cookieCheckWords)) return true;
    if (isUrlRedirected(page.url(), verifyUrl, this.authConfig.successUrlPattern)) return true;
    return false;
  }

  /** 通过 DOM 元素检测登录状态 */
  private async isLoggedInByElement(page: Page): Promise<boolean> {
    return page.evaluate(({ noLogin, loggedIn }) => {
      const hasNoLogin = document.querySelectorAll(noLogin.join(",")).length > 0;
      const hasLoggedIn = document.querySelectorAll(loggedIn.join(",")).length > 0;
      return hasLoggedIn && !hasNoLogin;
    }, { noLogin: NO_LOGIN_SELECTORS, loggedIn: LOGGED_IN_SELECTORS });
  }

  private async verifySession(session: SessionState, verifyUrl: string): Promise<boolean> {
    const browser = new BrowserLifecycleManager(this.logger);
    try {
      const page = await browser.launch(verifyUrl, true, session, "domcontentloaded", SESSION_VALIDATE_TIMEOUT_MS);
      await page.waitForLoadState("load", { timeout: PAGE_LOAD_FALLBACK_TIMEOUT_MS }).catch(() => {});
      await page.waitForTimeout(LOGIN_SUCCESS_POLL_MS);
      return await this.verifyLoginState(page, verifyUrl);
    } catch (err) {
      this.logger.warn("验证会话时发生错误，视为无效", { err: (err as Error).message });
      return false;
    } finally {
      await browser.close();
    }
  }

  private async manualLogin(loginUrl: string, verifyUrl: string, profile: string): Promise<SessionState | null> {
    const browser = new BrowserLifecycleManager(this.logger);
    try {
      const page = await browser.launch(loginUrl, false);
      console.log("\n========================================");
      console.log("🌐 有头浏览器已打开，请手动完成登录");
      console.log("💡 登录成功后，程序将自动检测并继续 ...");
      console.log("========================================\n");
      this.logger.info("等待手动登录...");

      await this.waitForLoginSuccess(page);

      this.logger.info("✅ 检测到登录成功，正在提取会话数据...");
      const session = await captureSessionFromPage(page, page.context());
      await this.sessionManager.save(profile, session);
      this.logger.info(`💾 会话已保存至 sessions/${profile}`);
      return session;
    } catch (err) {
      this.logger.error("人工登录流程异常", { err: (err as Error).message });
      return null;
    } finally {
      await browser.close();
    }
  }

  private async waitForLoginSuccess(page: Page): Promise<void> {
    const startTime = Date.now();
    const initialUrl = page.url();

    const hasLoginBtn = async () => {
      for (const sel of NO_LOGIN_SELECTORS) {
        const el = await page.$(sel);
        if (el && (await el.isVisible())) return true;
      }
      return false;
    };

    if (!(await hasLoginBtn()) && await this.verifyLoginState(page, initialUrl)) return;

    while (Date.now() - startTime < MANUAL_LOGIN_TIMEOUT_MS) {
      await new Promise((r) => setTimeout(r, LOGIN_SUCCESS_POLL_MS));
      try {
        if (isUrlRedirected(page.url(), initialUrl, this.authConfig.successUrlPattern)) return;
        if (await hasValidAuthCookie(page.context(), this.authConfig.cookieCheckWords)) return;
        if (!(await hasLoginBtn()) && await this.isLoggedInByElement(page)) return;
      } catch {
        continue;
      }
    }
    throw new Error("登录超时，用户未在 5 分钟内完成登录");
  }
}

// ── 纯函数辅助 ───────────────────────────────────────────

/** Cookie 中是否存在鉴权关键词 */
export async function hasValidAuthCookie(ctx: BrowserContext, keywords?: string[]): Promise<boolean> {
  const words = keywords ?? DEFAULT_COOKIE_KEYWORDS;
  const cookies = await ctx.cookies();
  return cookies.some((c) => words.some((w) => c.name.toLowerCase().includes(w)));
}

/** URL 是否已发生明显跳转（无 login 片段且不等于初始 URL） */
export function isUrlRedirected(currentUrl: string, originalUrl: string, successPattern?: string): boolean {
  const cur = currentUrl.split("?")[0].replace(/\/$/, "");
  const orig = originalUrl.split("?")[0].replace(/\/$/, "");
  if (cur !== orig) return true;
  if (successPattern && currentUrl.includes(successPattern)) return true;
  return false;
}
