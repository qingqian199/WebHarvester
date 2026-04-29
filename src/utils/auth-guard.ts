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
} from "../core/constants/GlobalConstant";

interface AuthConfig {
  loginUrl?: string;
  verifyUrl?: string;
  loggedInSelector?: string;
  loggedOutSelector?: string;
}

export class AuthGuard {
  private logger: ILogger;

  constructor(
    private sessionManager: FileSessionManager,
    private authConfig: AuthConfig = {},
    logger?: ILogger,
  ) {
    this.logger = logger ?? new ConsoleLogger();
  }

  async ensureAuth(
    profile: string,
    targetLoginUrl: string,
    targetVerifyUrl: string
  ): Promise<SessionState | null> {
    const loginUrl = this.authConfig.loginUrl || targetLoginUrl;
    const verifyUrl = this.authConfig.verifyUrl || targetVerifyUrl;

    let session = await this.sessionManager.load(profile);
    if (session) {
      this.logger.info(`📂 已找到会话文件 ${profile}，正在验证有效性...`);
      const isValid = await this.verifySession(session, verifyUrl);
      if (isValid) {
        this.logger.info(`✅ 会话有效，跳过登录`);
        return session;
      } else {
        this.logger.warn(`⚠️ 会话已失效，需要重新登录`);
        await this.sessionManager.deleteProfile(profile);
      }
    }

    this.logger.info(`🔓 正在启动有头浏览器，请手动登录...`);
    return await this.manualLogin(loginUrl, verifyUrl, profile);
  }

  private async verifySession(session: SessionState, verifyUrl: string): Promise<boolean> {
    const browser = new BrowserLifecycleManager(this.logger);
    try {
      const page = await browser.launch(verifyUrl, true, session);
      await page.waitForLoadState("networkidle", { timeout: SESSION_VALIDATE_TIMEOUT_MS }).catch(() => { });
      await page.waitForTimeout(2000);

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

    const LOGIN_SUCCESS_SELECTORS = [
      ".user-avatar", ".header-user-avatar", ".user-name",
      "[class*='user-center']", ".user-info", ".bili-avatar",
      "[class*='logged-in']", "[class*='login-success']",
    ];

    while (Date.now() - startTime < MANUAL_LOGIN_TIMEOUT_MS) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const hasContent = await page.evaluate(() => document.body.innerText.length > 50);
        if (!hasContent) continue;

        const currentUrl = page.url();
        const urlChanged = currentUrl.split("?")[0] !== initialUrl.split("?")[0];

        const foundUserElement = await page.evaluate((selectors) => {
          return selectors.some((s) => document.querySelector(s));
        }, LOGIN_SUCCESS_SELECTORS);

        if (urlChanged || foundUserElement) return;
      } catch {
        continue;
      }
    }

    throw new Error("登录超时，用户未在 5 分钟内完成登录");
  }
}
