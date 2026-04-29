import { Page } from "playwright";
import { BrowserLifecycleManager } from "../adapters/BrowserLifecycleManager";
import { FileSessionManager } from "../adapters/FileSessionManager";
import { ILogger } from "../core/ports/ILogger";
import { SessionState } from "../core/ports/ISessionManager";
import { ConsoleLogger } from "../adapters/ConsoleLogger";
import { NetworkRequest, ElementItem } from "../core/models";
import { filterApiRequests } from "../core/rules";
import { captureSessionFromPage } from "./session-helper";
import {
  LOGIN_PAGE_LOAD_TIMEOUT_MS,
  LOGIN_FORM_WAIT_MS,
  LOGIN_SUBMIT_AFTER_WAIT_MS,
} from "../core/constants/GlobalConstant";

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
    let page: Page;
    try {
      page = await lcm.launch(loginUrl, true, undefined, "domcontentloaded", LOGIN_PAGE_LOAD_TIMEOUT_MS);
      lcm.startNetworkCapture();
    } catch (e) {
      throw new Error(`登录页面加载失败，请检查 URL 是否正确（通常为 https://site.com/login）。原始错误：${(e as Error).message}`);
    }

    await page.waitForTimeout(LOGIN_FORM_WAIT_MS);
    const networkRequests = lcm.getCapturedRequests();
    const elements = await this.queryFormElements(page);
    await lcm.close();

    const intel = this.analyzeLoginForm(elements, networkRequests);
    this.logger.info("✅ 登录情报提取完成", {
      formAction: intel.formAction,
      method: intel.method,
      captchaRequired: intel.captchaRequired
    });
    return intel;
  }

  async executeLogin(
    loginUrl: string,
    verifyUrl: string,
    intel: LoginIntel,
    username: string,
    password: string,
    profile: string
  ): Promise<SessionState | null> {
    this.logger.info("🔑 正在执行自动登录...");
    const lcm = new BrowserLifecycleManager(this.logger);
    const page = await lcm.launch(loginUrl, false, undefined, "domcontentloaded", LOGIN_PAGE_LOAD_TIMEOUT_MS);

    try {
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(LOGIN_SUBMIT_AFTER_WAIT_MS);

      const userSelector = `input[name="${intel.paramMap.username}"], input[id="${intel.paramMap.username}"], input[placeholder*="${intel.paramMap.username}"]`;
      await page.fill(userSelector, username);

      const passSelector = `input[name="${intel.paramMap.password}"], input[id="${intel.paramMap.password}"], input[placeholder*="${intel.paramMap.password}"]`;
      await page.fill(passSelector, password);

      if (intel.csrfField) {
        await page.evaluate((csrf) => {
          const input = document.createElement("input");
          input.type = "hidden";
          input.name = csrf.name;
          input.value = csrf.value;
          document.forms[0]?.appendChild(input);
        }, intel.csrfField);
      }

      const submitSelector = `button[type="submit"], input[type="submit"], button:has-text("登录"), button:has-text("登入"), button:has-text("Sign in"), button:has-text("Log in")`;
      await page.click(submitSelector);

      await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => { });
      await page.waitForTimeout(2000);

      const session = await captureSessionFromPage(page, page.context());
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
        const hasLoginKeyword = ["login", "sign in", "登录", "登入"].some(k => bodyText.includes(k));
        const hasUserElement = !!document.querySelector(".user-avatar, .user-name, .profile");
        return hasLoginKeyword && !hasUserElement;
      });

      return !stillNeedLogin;
    } catch {
      return false;
    } finally {
      await browser.close();
    }
  }

  private analyzeLoginForm(elements: ElementItem[], requests: NetworkRequest[]): LoginIntel {
    const defaultIntel: LoginIntel = {
      formAction: "",
      method: "POST",
      paramMap: { username: "username", password: "password" },
      captchaRequired: false,
      rawRequests: []
    };

    for (const el of elements) {
      if (el.tagName === "form") {
        defaultIntel.formAction = el.attributes.action || "";
        defaultIntel.method = (el.attributes.method || "POST").toUpperCase();
        break;
      }
    }

    const apiList = filterApiRequests(requests);
    defaultIntel.rawRequests = apiList;

    for (const el of elements) {
      if (el.tagName !== "input") continue;
      const name = (el.attributes.name || "").toLowerCase();
      const id = (el.attributes.id || "").toLowerCase();
      const type = (el.attributes.type || "text").toLowerCase();

      if (name.includes("user") || name.includes("account") || name.includes("email") ||
          id.includes("user") || id.includes("account")) {
        defaultIntel.paramMap.username = el.attributes.name || id;
      }

      if (type === "password") {
        defaultIntel.paramMap.password = el.attributes.name || id;
      }

      if (name.includes("csrf") || name.includes("token") || name.includes("_token")) {
        defaultIntel.csrfField = { name: el.attributes.name, value: el.attributes.value || "" };
      }

      if (name.includes("captcha") || name.includes("vercode") || name.includes("verify")) {
        defaultIntel.captchaRequired = true;
      }
    }

    if (!defaultIntel.formAction && apiList.length > 0) {
      const loginPost = apiList.find(r =>
        r.method === "POST" && (r.url.includes("login") || r.url.includes("signin"))
      );
      if (loginPost) {
        defaultIntel.formAction = loginPost.url;
        defaultIntel.method = "POST";
      }
    }

    return defaultIntel;
  }

  private async queryFormElements(page: Page): Promise<ElementItem[]> {
    const selector = "input, form, button";
    return page.$$eval(selector, (nodes: any[], sel: string) =>
      nodes.map(n => ({
        selector: sel,
        tagName: n.tagName.toLowerCase(),
        attributes: Object.fromEntries([...n.attributes].map(a => [a.name, a.value])),
        text: n.textContent?.trim(),
      })),
      selector,
    );
  }
}
