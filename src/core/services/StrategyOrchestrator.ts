import fetch from "node-fetch";

const SPA_PATTERNS = [
  "__NUXT__", "__NEXT_DATA__", "__REACT_DEVTOOLS_GLOBAL_HOOK__",
  "ng-version", "ng-app", "vue-resource", "vue-router",
  "createApp", "createRoot", "ReactDOM.render",
  "window.__initial_state__", "window.__INITIAL_STATE__",
];

const JS_CHALLENGE_PATTERNS = [
  "cdn-cgi/challenge-platform", "cf-browser-verification",
  "cloudflare", "__cf_chl_frm", "_cf_chl_opt",
  "data-nscript", "Next.js Challenge", "just a moment",
];

const SHELL_THRESHOLD = 300;
const EMPTY_CONTENT_THRESHOLD = 150;
const STATIC_DOC_THRESHOLD = 500;
const SCRIPT_COUNT_THRESHOLD = 2;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const SCOUT_TIMEOUT_MS = 5000;

interface ScoutCacheEntry {
  engine: "http" | "browser";
  expiresAt: number;
}

const scoutCache = new Map<string, ScoutCacheEntry>();

function getDomain(url: string): string {
  try { return new URL(url).hostname; } catch { return url; }
}

/** 策略编排器。根据页面 HTML 特征 + 侦察请求决定使用轻量 HTTP 引擎还是浏览器引擎。 */
export class StrategyOrchestrator {
  /**
   * 根据原始 HTML 判断最优采集引擎。
   * @param rawHtml 页面 HTML 源码。
   * @returns "http" — 轻量 HTTP 引擎可用；"browser" — 需要使用浏览器渲染。
   */
  static async decideEngine(rawHtml: string): Promise<"http" | "browser"> {
    const html = rawHtml.trim();

    if (SPA_PATTERNS.some((p) => html.includes(p))) return "browser";

    // 检测 JS 挑战页面（Cloudflare 等）
    if (JS_CHALLENGE_PATTERNS.some((p) => html.includes(p))) return "browser";

    const scriptCount = (html.match(/<script[\s>]/gi) || []).length;
    if (scriptCount >= SCRIPT_COUNT_THRESHOLD) return "browser";

    const textContent = html.replace(/<[^>]+>/g, "").trim();
    const hasShellRoot = html.includes("<div id=\"app\"") || html.includes("<div id=\"root\"");
    if (hasShellRoot && textContent.length < EMPTY_CONTENT_THRESHOLD) return "browser";

    if (html.length < SHELL_THRESHOLD) return "browser";

    const hasArticle = html.includes("<article") || (html.includes("<main>") && html.includes("<p>"));
    if (hasArticle && textContent.length > STATIC_DOC_THRESHOLD) return "http";

    return "browser";
  }

  /**
   * 发送侦察请求，检测目标是否有 JS 挑战或重定向。
   * 结果按域名缓存 30 分钟。
   */
  static async scout(url: string): Promise<"http" | "browser"> {
    const domain = getDomain(url);

    // 缓存命中
    const cached = scoutCache.get(domain);
    if (cached && Date.now() < cached.expiresAt) return cached.engine;

    // 缓存未命中 — 发侦察请求
    const result = await StrategyOrchestrator.doScout(url);
    scoutCache.set(domain, { engine: result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  }

  private static async doScout(url: string): Promise<"http" | "browser"> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), SCOUT_TIMEOUT_MS);

      // 第一步：不跟随重定向，检测 301/302
      const firstRes = await fetch(url, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal as any,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/125.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });
      clearTimeout(timeout);

      const status = firstRes.status;
      const body = await firstRes.text();

      // 503 + JS challenge → 浏览器
      if (status === 503 && JS_CHALLENGE_PATTERNS.some((p) => body.includes(p))) {
        return "browser";
      }

      // 301/302 → 跟随重定向后再次判断
      if (status === 301 || status === 302) {
        const location = firstRes.headers.get("location");
        if (location) {
          const redirectUrl = new URL(location, url).href;
          return StrategyOrchestrator.doScout(redirectUrl);
        }
      }

      // 用静态规则分析响应体
      return StrategyOrchestrator.decideEngine(body);
    } catch {
      // 侦察失败（超时/网络错误）→ 保守返回 browser
      return "browser";
    }
  }

  /** 清除侦察缓存。 */
  static clearCache(): void {
    scoutCache.clear();
  }

  /** 获取缓存中的域名数量（用于测试/监控）。 */
  static get cacheSize(): number {
    return scoutCache.size;
  }
}
