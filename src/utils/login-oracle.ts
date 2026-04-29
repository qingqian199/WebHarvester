import { Page } from "playwright";
import { BrowserLifecycleManager } from "../adapters/BrowserLifecycleManager";
import { FileSessionManager } from "../adapters/FileSessionManager";
import { ILogger } from "../core/ports/ILogger";
import { SessionState } from "../core/ports/ISessionManager";
import { ConsoleLogger } from "../adapters/ConsoleLogger";
import { NetworkRequest, ElementItem } from "../core/models";
import { filterApiRequests } from "../core/rules";
import { captureSessionFromPage } from "./session-helper";

const LOGIN_TRIGGER_SELECTORS = [
  'a:has-text("登录"), a:has-text("登入"), a:has-text("Sign in")',
  'button:has-text("登录"), button:has-text("登入"), button:has-text("Sign in")',
  '.login-btn, .header-login, [class*="login"], [class*="signin"]',
  '.bili-header__bar-login-btn, .header-login-btn',
];

const PASSWORD_TAB_SELECTORS = [
  'span:has-text("密码登录"), div:has-text("密码登录")',
  'span:has-text("账号登录"), div:has-text("账号登录")',
  'li:has-text("密码登录"), li:has-text("账号登录")',
  '.bili-mini-tab[data-type="password"], [class*="tab"]:has-text("密码")',
];

const PAGE_LOAD_TIMEOUT = 60000;
const FIELD_DETECT_TIMEOUT = 15000;

interface LoginIntel {
  formAction: string;
  method: string;
  csrfField?: { name: string; value: string };
  paramMap: {
    username: string;
    password: string;
  };
  captchaRequired: boolean;
  rawRequests: NetworkRequest[];
}

export class LoginOracle {
  private logger: ILogger;

  constructor(private sessionManager: FileSessionManager, logger?: ILogger) {
    this.logger = logger ?? new ConsoleLogger();
  }

  async gatherIntel(loginUrl: string): Promise<LoginIntel> {
    this.logger.info("🔍 正在采集登录页面情报...");
    const lcm = new BrowserLifecycleManager(this.logger);
    try {
      const page = await lcm.launch(loginUrl, false, undefined, "domcontentloaded", PAGE_LOAD_TIMEOUT);
      await page.waitForLoadState("load", { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(2000);

      await this.triggerLoginModal(page);
      const ok = await this.waitForLoginForm(page, FIELD_DETECT_TIMEOUT);

      let elements: ElementItem[] = [];
      if (ok) {
        await page.waitForTimeout(500);
        elements = await this.queryFormElements(page);
      } else {
        this.logger.warn("未检测到登录表单弹窗，将使用页面现有元素进行分析");
        elements = await this.queryFormElements(page);
      }

      const networkRequests = lcm.getCapturedRequests();
      const intel = this.analyzeLoginForm(elements, networkRequests);
      this.logger.info("✅ 登录情报提取完成", {
        formAction: intel.formAction,
        method: intel.method,
        captchaRequired: intel.captchaRequired,
      });
      return intel;
    } catch (e) {
      throw new Error(
        `登录页面加载失败，请检查 URL 是否正确（通常为 https://site.com/login）。原始错误：${(e as Error).message}`,
      );
    } finally {
      await lcm.close();
    }
  }

  async executeLogin(
    loginUrl: string,
    verifyUrl: string,
    intel: LoginIntel,
    username: string,
    password: string,
    profile: string,
  ): Promise<SessionState | null> {
    this.logger.info("🔑 正在执行自动登录...");
    const lcm = new BrowserLifecycleManager(this.logger);
    try {
      const page = await lcm.launch(loginUrl, false, undefined, "domcontentloaded", PAGE_LOAD_TIMEOUT);
      await page.waitForLoadState("load", { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(2000);

      await this.triggerLoginModal(page);
      const ok = await this.waitForLoginForm(page, FIELD_DETECT_TIMEOUT);

      if (!ok) {
        this.logger.warn("无法打开登录弹窗，尝试直接在当前页面查找表单字段");
      }

      const usernameField = await this.findInputField(page, intel.paramMap.username, username);
      const passwordField = await this.findInputField(page, intel.paramMap.password, password);

      if (!usernameField || !passwordField) {
        throw new Error(`无法定位登录输入框。检测到的用户名字段: ${intel.paramMap.username}，密码字段: ${intel.paramMap.password}`);
      }

      await usernameField.fill(username);
      await passwordField.fill(password);

      await this.tryClickSubmit(page);

      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => { });
      await page.waitForTimeout(3000);

      const session = await this.tryCaptureSession(page, verifyUrl);
      await this.sessionManager.save(profile, session);
      this.logger.info(`💾 会话已保存：${profile}`);

      return session;
    } catch (err) {
      this.logger.error("自动登录失败", { err: (err as Error).message });
      return null;
    } finally {
      await lcm.close();
    }
  }

  async validateSession(session: SessionState, verifyUrl: string): Promise<boolean> {
    const browser = new BrowserLifecycleManager(this.logger);
    try {
      const page = await browser.launch(verifyUrl, true, session, "domcontentloaded", 15000);
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(2000);

      const stillNeedLogin = await page.evaluate(() => {
        const bodyText = document.body.innerText.toLowerCase();
        const hasLoginKeyword = ["login", "sign in", "登录", "登入"].some((k) => bodyText.includes(k));
        const hasUserElement = !!document.querySelector(".user-avatar, .user-name, .profile, .bili-avatar");
        return hasLoginKeyword && !hasUserElement;
      });

      return !stillNeedLogin;
    } catch {
      return false;
    } finally {
      await browser.close();
    }
  }

  private async triggerLoginModal(page: Page): Promise<void> {
    for (const sel of LOGIN_TRIGGER_SELECTORS) {
      const btn = page.locator(sel).first();
      if ((await btn.count()) > 0) {
        await btn.click().catch(() => {});
        await page.waitForTimeout(1000);
        return;
      }
    }
  }

  private async waitForLoginForm(page: Page, timeout: number): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const hasInput = await page.evaluate(() => {
        const inputs = document.querySelectorAll<HTMLInputElement>(
          'input[type="email"], input[type="password"], input[autocomplete="username"], input[autocomplete="current-password"], input[type="tel"]',
        );
        return inputs.length >= 2;
      });

      if (hasInput) return true;

      for (const sel of PASSWORD_TAB_SELECTORS) {
        const tab = page.locator(sel).first();
        if ((await tab.count()) > 0) {
          await tab.click().catch(() => {});
          await page.waitForTimeout(800);
        }
      }

      await page.waitForTimeout(500);
    }
    return false;
  }

  private async findInputField(
    page: Page,
    fieldName: string,
    _fieldValue: string,
  ): Promise<{ fill: (v: string) => Promise<void> } | null> {
    const selectors = [
      `input[name="${fieldName}"]`,
      `input[id="${fieldName}"]`,
      `input[placeholder*="${fieldName}"]`,
      'input[autocomplete="username"]',
      'input[autocomplete="email"]',
      'input[autocomplete="current-password"]',
      'input[type="email"]',
      'input[type="tel"]',
      'input[type="password"]',
    ];

    for (const sel of selectors) {
      const loc = page.locator(sel).first();
      if ((await loc.count()) > 0 && (await loc.isVisible())) {
        return { fill: (v: string) => loc.fill(v) };
      }
    }
    return null;
  }

  private async tryClickSubmit(page: Page): Promise<void> {
    const submitSelectors = [
      'button[type="submit"], input[type="submit"]',
      'button:has-text("登录"), button:has-text("登入")',
      'button:has-text("Sign in"), button:has-text("Log in")',
      '.login-btn, [class*="submit"], [class*="login"] button',
    ];

    for (const sel of submitSelectors) {
      const btn = page.locator(sel).first();
      if ((await btn.count()) > 0 && (await btn.isVisible())) {
        await btn.click().catch(() => {});
        return;
      }
    }
  }

  private async tryCaptureSession(page: Page, verifyUrl: string): Promise<SessionState> {
    const currentUrl = page.url().split("?")[0];
    const initialUrl = verifyUrl.split("?")[0];

    if (currentUrl !== initialUrl) {
      return captureSessionFromPage(page, page.context());
    }

    await page.waitForTimeout(3000);
    const modalClosed = await page.evaluate(() => {
      const modal = document.querySelector(".modal, .dialog, [class*='overlay'], .bili-mini-mask");
      return !modal;
    });

    if (modalClosed) {
      return captureSessionFromPage(page, page.context());
    }

    await page.goto(verifyUrl, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    return captureSessionFromPage(page, page.context());
  }

  private analyzeLoginForm(elements: ElementItem[], requests: NetworkRequest[]): LoginIntel {
    const intel: LoginIntel = {
      formAction: "",
      method: "POST",
      paramMap: { username: "username", password: "password" },
      captchaRequired: false,
      rawRequests: [],
    };

    for (const el of elements) {
      if (el.tagName === "form") {
        intel.formAction = el.attributes.action || "";
        intel.method = (el.attributes.method || "POST").toUpperCase();
        break;
      }
    }

    const apiList = filterApiRequests(requests);
    intel.rawRequests = apiList;

    for (const el of elements) {
      if (el.tagName !== "input") continue;
      const name = (el.attributes.name || "").toLowerCase();
      const id = (el.attributes.id || "").toLowerCase();
      const type = (el.attributes.type || "text").toLowerCase();
      const placeholder = (el.attributes.placeholder || "").toLowerCase();
      const autocomplete = (el.attributes.autocomplete || "").toLowerCase();

      const isUsernameField =
        type === "email" ||
        type === "tel" ||
        autocomplete === "username" ||
        autocomplete === "email" ||
        ["user", "account", "email", "mail", "phone", "mobile", "login", "logon_id", "login_id"].some(
          (k) => name.includes(k) || id.includes(k) || placeholder.includes(k),
        );

      if (isUsernameField) {
        intel.paramMap.username = el.attributes.name || el.attributes.id || "username";
      }

      if (type === "password" || autocomplete === "current-password") {
        intel.paramMap.password = el.attributes.name || el.attributes.id || "password";
      }

      if (name.includes("csrf") || name.includes("_token")) {
        intel.csrfField = { name: el.attributes.name, value: el.attributes.value || "" };
      }

      if (
        name.includes("captcha") ||
        name.includes("vercode") ||
        name.includes("verify") ||
        placeholder.includes("captcha") ||
        placeholder.includes("验证码")
      ) {
        intel.captchaRequired = true;
      }
    }

    if (!intel.formAction && apiList.length > 0) {
      const loginPost = apiList.find(
        (r) =>
          r.method === "POST" &&
          (r.url.includes("login") || r.url.includes("signin") || r.url.includes("passport")),
      );
      if (loginPost) {
        intel.formAction = loginPost.url;
        intel.method = "POST";
      }
    }

    return intel;
  }

  private async queryFormElements(page: Page): Promise<ElementItem[]> {
    const selector = "input, form, button";
    return page.$$eval(
      selector,
      (nodes: any[], sel: string) =>
        nodes.map((n) => ({
          selector: sel,
          tagName: n.tagName.toLowerCase(),
          attributes: Object.fromEntries([...n.attributes].map((a: any) => [a.name, a.value])),
          text: n.textContent?.trim(),
        })),
      selector,
    );
  }
}
