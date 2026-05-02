import { NetworkRequest } from "../../core/models";

export interface AntiCrawlItem {
  category: string;
  severity: "high" | "medium" | "low";
  requestKey: string;
  details: {
    url: string;
    method: string;
    params?: Record<string, string>;
    bodyHint?: string;
  };
  suggestion: string;
  relatedFiles?: string[];
}

const ANTI_CRAWL_RULES: Array<{
  test: (req: NetworkRequest) => boolean;
  category: string;
  severity: AntiCrawlItem["severity"];
  suggestion: string;
}> = [
  {
    test: (req) => req.url.includes("w_rid=") && req.url.includes("wts="),
    category: "wbi_sign",
    severity: "high",
    suggestion:
      "需要实现 WBI 签名算法。img_key 和 sub_key 可从 localStorage 或 nav 接口获取。HAR 中已提供本次签名范例，可用于验证算法。",
  },
  {
    test: (req) => req.url.includes("ExClimbWuzhi"),
    category: "gaia_device_reg",
    severity: "high",
    suggestion:
      "设备注册请求，需逆向 bili-sc-sdk 生成指纹。可尝试模拟一次注册后复用凭证。",
  },
  {
    test: (req) => req.url.includes("ExGetAxe"),
    category: "gaia_get_axe",
    severity: "high",
    suggestion:
      "获取加密公钥。响应中包含公钥信息，需结合 SDK 进行加密。",
  },
  {
    test: (req) => req.url.includes("ExClimbCongLing"),
    category: "gaia_upload",
    severity: "high",
    suggestion:
      "提交加密 payload。需先完成设备注册和公钥获取。",
  },
  {
    test: (req) => {
      const url = req.url.toLowerCase();
      const body = JSON.stringify(req.requestBody ?? "").toLowerCase();
      return (
        (url.includes("captcha") || url.includes("geetest")) ||
        body.includes("captcha") ||
        body.includes("geetest")
      );
    },
    category: "captcha",
    severity: "medium",
    suggestion:
      "检测到验证码相关请求。需对接打码平台或实现验证码识别逻辑。",
  },
  {
    test: (req) => {
      const url = req.url.toLowerCase();
      return url.includes("xsec_token") || url.includes("xsec_source");
    },
    category: "xhs_xsec_token",
    severity: "low",
    suggestion:
      "小红书 xsec_token 反爬参数。可尝试从页面 HTML 或 __INITIAL_STATE__ 中提取后复用。若为空字符串可能被服务器忽略。",
  },
  {
    test: (req) => {
      const body = JSON.stringify(req.requestBody ?? "");
      return body.includes("csrf") && !body.includes("csrf_token");
    },
    category: "anti_csrf",
    severity: "medium",
    suggestion:
      "请求中包含 CSRF 令牌。需从页面或 Cookie 中提取并动态更新。",
  },
];

export class AntiCrawlTagger {
  tag(requests: NetworkRequest[]): AntiCrawlItem[] {
    const items: AntiCrawlItem[] = [];
    for (const req of requests) {
      for (const rule of ANTI_CRAWL_RULES) {
        if (rule.test(req)) {
          items.push({
            category: rule.category,
            severity: rule.severity,
            requestKey: `${req.method} ${req.url}`,
            details: {
              url: req.url,
              method: req.method,
              params: this.extractParams(req.url),
              bodyHint: req.requestBody
                ? JSON.stringify(req.requestBody).slice(0, 200)
                : undefined,
            },
            suggestion: rule.suggestion,
            relatedFiles: this.guessRelatedFiles(req.url),
          });
        }
      }
    }
    return [...new Map(items.map((i) => [i.requestKey, i])).values()];
  }

  private extractParams(url: string): Record<string, string> {
    const params: Record<string, string> = {};
    try {
      const u = new URL(url);
      u.searchParams.forEach((v, k) => {
        params[k] = v;
      });
    } catch {}
    return params;
  }

  private guessRelatedFiles(url: string): string[] {
    if (url.includes("ExClimb") || url.includes("gaia"))
      return ["bili-sc-sdk.umd.js"];
    if (url.includes("w_rid")) return ["bili-player.js"];
    return [];
  }
}
