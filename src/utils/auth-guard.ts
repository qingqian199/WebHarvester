import { Page } from "playwright";
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

interface AuthConfig {
  loginUrl?: string;
  verifyUrl?: string;
  loggedInSelector?: string;
  loggedOutSelector?: string;
}

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
  async ensureAuth(
    profile: string,
    targetLoginUrl: string,
    targetVerifyUrl: string
  ): Promise<SessionState | null> {
    const loginUrl = this.authConfig.loginUrl || targetLoginUrl;
    const verifyUrl = this.authConfig.verifyUrl || targetVerifyUrl;

    const session = await this.sessionManager.load(profile);
    if (session) {
      this.logger.info(`📂 已找到会话文件 ${profile}，正在验证有效性...`);
      const isValid = await this.verifySession(session, verifyUrl);
      if (isValid) {
        this.logger.info("✅ 会话有效，跳过登录");
        return session;
      } else {
        this.logger.warn("⚠️ 会话已失效，需要重新登录");
        await this.sessionManager.deleteProfile(profile);
      }
    }

    this.logger.info("🔓 正在启动有头浏览器，请手动登录...");
    return await this.manualLogin(loginUrl, verifyUrl, profile);
  }

  private async verifySession(session: SessionState, verifyUrl: string): Promise<boolean> {
    const browser = new BrowserLifecycleManager(this.logger);
    try {
      const page = await browser.launch(verifyUrl, true, session, "domcontentloaded", SESSION_VALIDATE_TIMEOUT_MS);
      await page.waitForLoadState("load", { timeout: PAGE_LOAD_FALLBACK_TIMEOUT_MS }).catch(() => { });
      await page.waitForTimeout(LOGIN_SUCCESS_POLL_MS);

      let loggedIn = false;
      if (this.authConfig.loggedInSelector) {
        loggedIn = (await page.$(this.authConfig.loggedInSelector)) !== null;
      } else if (this.authConfig.loggedOutSelector) {
        loggedIn = (await page.$(this.authConfig.loggedOutSelector)) === null;
      } else {
        const hasLoginBtn = await page.$("a[href*='login'], button[class*='login'], .login-btn");
        const hasUserAvatar = await page.$(".user-avatar, .header-user-avatar, [class*='user-center']");
        loggedIn = !hasLoginBtn || hasUserAvatar !== null;
      }

      return loggedIn;
    } catch (err) {
      this.logger.warn("验证会话时发生错误，视为无效", { err: (err as Error).message });
      return false;
    } finally {
      await browser.close();
    }
  }

  private async manualLogin(
    loginUrl: string,
    verifyUrl: string,
    profile: string
  ): Promise<SessionState | null> {
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

      await       this.sessionManager.save(profile, session);
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

    // 登录按钮的选择器（这些元素消失 = 登录成功）
    const LOGIN_BTN_SELECTORS = [
      "a[href*=\"login\"], button[class*=\"login\"], .login-btn, .header-login-btn",
      "[class*=\"header\"] [class*=\"login\"]",
      ".bili-header__bar-login-btn",
    ];

    /** 页面是否仍包含可点击的登录按钮（未登录状态） */
    const hasLoginBtn = async () => {
      for (const sel of LOGIN_BTN_SELECTORS) {
        const el = await page.$(sel);
        if (el && (await el.isVisible())) return true;
      }
      return false;
    };

    // 立即检查：如果登录按钮不存在且页面内容正常，说明已处于登录态
    if (!(await hasLoginBtn())) {
      const hasContent = await page.evaluate(() => document.body.innerText.length > 50).catch(() => false);
      if (hasContent) return;
    }

    while (Date.now() - startTime < MANUAL_LOGIN_TIMEOUT_MS) {
      await new Promise((r) => setTimeout(r, LOGIN_SUCCESS_POLL_MS));
      try {
        const currentUrl = page.url();
        const urlChanged = currentUrl.split("?")[0] !== initialUrl.split("?")[0];
        if (urlChanged) return;

        if (!(await hasLoginBtn())) return;
      } catch {
        continue;
      }
    }

    throw new Error("登录超时，用户未在 5 分钟内完成登录");
  }
}
