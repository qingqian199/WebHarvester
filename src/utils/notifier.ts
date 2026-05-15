/**
 * 告警通知接口。
 */
export interface Notifier {
  /** 发送告警。level: error / warn / info */
  sendAlert(level: "error" | "warn" | "info", title: string, message: string): Promise<void>;
}

/**
 * 控制台通知实现。
 * 直接打印到 stderr/stdout。
 */
export class ConsoleNotifier implements Notifier {
  async sendAlert(level: "error" | "warn" | "info", title: string, message: string): Promise<void> {
    const timestamp = new Date().toISOString();
    const prefix = level === "error" ? "🔴" : level === "warn" ? "🟡" : "🔵";
    const output = level === "error" ? process.stderr : process.stdout;
    output.write(`${prefix} [${timestamp}] ${title}\n  ${message}\n`);
  }
}

/**
 * Webhook 通知实现（预留）。
 * 支持 Slack、钉钉、企业微信等 Webhook。
 */
export class WebhookNotifier implements Notifier {
  constructor(private readonly webhookUrl: string) {}

  async sendAlert(level: "error" | "warn" | "info", title: string, message: string): Promise<void> {
    const payload = { level, title, message, timestamp: new Date().toISOString() };
    try {
      await fetch(this.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      // 静默失败
    }
  }
}

/**
 * 会话过期错误。
 */
export class SessionExpiredError extends Error {
  readonly code = "E401";
  readonly profile: string;

  constructor(profile: string, detail?: string) {
    super(`会话已过期: [${profile}]${detail ? ` — ${detail}` : ""}`);
    this.name = "SessionExpiredError";
    this.profile = profile;
  }
}

/**
 * 可恢复错误。
 * 抛出此错误的任务应当被延迟重试，而非立即标记为失败。
 * 用于 CDP 连接丢失、浏览器异常退出等可自动恢复的场景。
 */
export class RecoverableError extends Error {
  readonly code = "E501";

  constructor(message: string, readonly retryDelayMs = 10000) {
    super(message);
    this.name = "RecoverableError";
  }
}
