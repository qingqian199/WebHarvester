// ── Error categories ──

export const ERROR_CATEGORIES = [
  "SIGN_ERROR",
  "NETWORK_ERROR",
  "BROWSER_ERROR",
  "DOM_CHANGE",
  "CAPTCHA",
  "SESSION_EXPIRED",
  "RATE_LIMIT",
  "UNKNOWN",
] as const;

export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];

export interface ErrorClassification {
  category: ErrorCategory;
  suggestion: string;
  code?: string;
}

// ── Error code patterns ──

interface CategoryRule {
  category: ErrorCategory;
  /** Message patterns (substring match). */
  messagePatterns: string[];
  /** Numeric/string code patterns. */
  codePatterns: Array<string | RegExp>;
  /** Default suggestion for this category. */
  suggestion: string;
}

const RULES: CategoryRule[] = [
  {
    category: "SIGN_ERROR",
    messagePatterns: [
      "signature",
      "wbi",
      "签名",
      "invalid sign",
      "sign check",
      "sign err",
      "x-bogus",
      "x-bili-trace-id",
      "code=-352",
      "code=-3",
    ],
    codePatterns: ["-352", "-3", "352"],
    suggestion: "签名密钥可能已过期或无效。尝试刷新密钥（WBI 执行 trigger_wbi_sync，其他站点重新登录获取最新签名参数）。",
  },
  {
    category: "NETWORK_ERROR",
    messagePatterns: [
      "timeout",
      "etimedout",
      "econnrefused",
      "econnreset",
      "enotfound",
      "fetch failed",
      "network",
      "socket",
      "dns",
      "超时",
      "网络",
    ],
    codePatterns: [/^5\d{2}$/, "502", "503", "504"],
    suggestion: "网络连接异常。检查目标站点是否可达、代理配置是否正确、本地网络是否稳定。可尝试降低并发或切换代理。",
  },
  {
    category: "BROWSER_ERROR",
    messagePatterns: [
      "browser",
      "playwright",
      "cdp",
      "chrome",
      "context",
      "page crash",
      "target closed",
      "execution context",
      "browser",
    ],
    codePatterns: ["E101", "E102", "E104"],
    suggestion: "浏览器/CDP 异常。尝试重启 ChromeService 或降低浏览器并发数。检查 Chrome 安装和 CDP 端口连接。",
  },
  {
    category: "DOM_CHANGE",
    messagePatterns: [
      "selector",
      "element not found",
      "no element",
      "dom",
      "ssr",
      "不在 dom",
      "找不到元素",
      "waitforselector",
    ],
    codePatterns: ["E103", "E002"],
    suggestion: "目标页面 DOM 结构可能已变化。检查站点是否更新了页面布局，尝试使用浏览器降级模式重新采集。",
  },
  {
    category: "CAPTCHA",
    messagePatterns: [
      "captcha",
      "verify",
      "验证码",
      "滑块",
      "极验",
      "geetest",
      "recaptcha",
      "turnstile",
      "人机验证",
      "生物认证",
    ],
    codePatterns: ["-352", "412", "461"],
    suggestion: "触发验证码/人机验证。需人工介入完成验证，或检查请求频率是否过高（降低并发速率）。",
  },
  {
    category: "SESSION_EXPIRED",
    messagePatterns: [
      "login",
      "unauthorized",
      "未登录",
      "请登录",
      "token expired",
      "session expired",
      "credential",
      "auth",
      "cookie",
    ],
    codePatterns: ["401", "E401", "E402"],
    suggestion: "登录态已过期或无效。需重新登录（使用 account-login / qrcode 重新获取 Cookie）。",
  },
  {
    category: "RATE_LIMIT",
    messagePatterns: [
      "rate limit",
      "too many",
      "frequency",
      "访问频繁",
      "请求过快",
      "频率限制",
      "被限制",
    ],
    codePatterns: ["429", "403"],
    suggestion: "触发频率限制。降低采集并发数、增大请求间隔（rateLimiter 已自动记录，可等待后重试）。",
  },
];

const FALLBACK_SUGGESTION = "未知错误类型。请检查日志确认具体原因，或尝试重新采集。";

// ── Classifier ──

/**
 * 根据错误消息和错误码对错误进行分类。
 * @param message 错误消息文本
 * @param code 可选错误码（HTTP 状态码、业务错误码等）
 */
export function classifyError(message: string, code?: string): ErrorCategory {
  const lowerMsg = message.toLowerCase();

  // 1. 按错误码匹配
  if (code) {
    for (const rule of RULES) {
      for (const cp of rule.codePatterns) {
        if (typeof cp === "string" && cp === code) return rule.category;
        if (cp instanceof RegExp && cp.test(code)) return rule.category;
      }
    }
  }

  // 2. 按消息模式匹配
  for (const rule of RULES) {
    for (const pattern of rule.messagePatterns) {
      if (lowerMsg.includes(pattern.toLowerCase())) return rule.category;
    }
  }

  return "UNKNOWN";
}

/**
 * 获取错误分类结果，包含分类和建议文本。
 */
export function classifyWithSuggestion(message: string, code?: string): ErrorClassification {
  const category = classifyError(message, code);
  const rule = RULES.find((r) => r.category === category);
  return {
    category,
    suggestion: rule?.suggestion ?? FALLBACK_SUGGESTION,
    code,
  };
}

/**
 * 获取指定分类的预设建议文本。
 */
export function getSuggestion(category: ErrorCategory): string {
  const rule = RULES.find((r) => r.category === category);
  return rule?.suggestion ?? FALLBACK_SUGGESTION;
}
