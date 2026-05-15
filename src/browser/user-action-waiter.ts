import { Page } from "playwright";
import { ConsoleNotifier, Notifier } from "../utils/notifier";

export interface WaitOptions {
  /** 超时时间（毫秒），默认 300000（5分钟） */
  timeout?: number;
  /** 检测间隔（毫秒），默认 2000 */
  pollInterval?: number;
  /** 提示消息，默认 "请在 Chrome 中完成操作" */
  message?: string;
  /** 通知器 */
  notifier?: Notifier;
  /** 检测函数，返回 true 表示操作完成 */
  condition?: () => Promise<boolean>;
}

/**
 * 等待用户手动操作完成。
 * 在超时前每 `pollInterval` 毫秒调用 `condition`，
 * 返回 true 表示用户已完成操作。
 *
 * 超时后抛出 `UserActionTimeoutError`。
 */
export async function waitForUserAction(options: WaitOptions): Promise<void> {
  const timeout = options.timeout ?? 300000;
  const pollInterval = options.pollInterval ?? 2000;
  const notifier = options.notifier ?? new ConsoleNotifier();
  const condition = options.condition;

  if (!condition) {
    throw new Error("waitForUserAction 需要 condition 参数");
  }

  notifier.sendAlert("info",
    "⏳ 等待用户操作",
    options.message ?? "请在 Chrome 中完成验证码/扫码等操作，完成后将自动继续",
  );

  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollInterval));
    try {
      if (await condition()) return;
    } catch {
      // 页面可能已关闭，继续等待
    }
  }

  throw new UserActionTimeoutError(timeout);
}

/**
 * 用户操作超时错误。
 */
export class UserActionTimeoutError extends Error {
  readonly code = "E601";

  constructor(timeoutMs: number) {
    super(`等待用户操作超时 (${(timeoutMs / 1000).toFixed(0)}s)`);
    this.name = "UserActionTimeoutError";
  }
}

// ── 检测条件工厂 ──

export const detection = {
  /**
   * 等待页面 URL 匹配指定模式。
   * @param urlPattern 字符串或正则（如 /paper\/show/）
   */
  pageNavigated: (page: Page, urlPattern: RegExp | string): (() => Promise<boolean>) => {
    return async () => {
      try {
        const currentUrl = page.url();
        if (typeof urlPattern === "string") return currentUrl.includes(urlPattern);
        return urlPattern.test(currentUrl);
      } catch { return false; }
    };
  },

  /**
   * 等待指定 CSS 选择器从 DOM 中消失。
   */
  elementGone: (page: Page, selector: string): (() => Promise<boolean>) => {
    return async () => {
      try {
        const el = await page.$(selector);
        return el === null;
      } catch { return false; }
    };
  },

  /**
   * 等待特定 Cookie 出现（通过 document.cookie 或 Playwright API）。
   */
  cookieSet: (page: Page, cookieName: string): (() => Promise<boolean>) => {
    return async () => {
      try {
        const cookies = await page.context().cookies();
        return cookies.some((c) => c.name === cookieName && c.value.length > 0);
      } catch { return false; }
    };
  },

  /**
   * 等待页面标题不再是验证码相关文本。
   */
  captchaGone: (page: Page): (() => Promise<boolean>) => {
    return async () => {
      try {
        const title = await page.title();
        return !title.includes("百度安全验证") && !title.includes("安全验证");
      } catch { return false; }
    };
  },

  /**
   * 等待自定义 JS 表达式返回 true。
   */
  jsCondition: (page: Page, js: string): (() => Promise<boolean>) => {
    return async () => {
      try {
        return await page.evaluate(js) === true;
      } catch { return false; }
    };
  },
};
