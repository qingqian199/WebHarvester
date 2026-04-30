const SPA_PATTERNS = [
  "__NUXT__", "__NEXT_DATA__", "__REACT_DEVTOOLS_GLOBAL_HOOK__",
  "ng-version", "ng-app", "vue-resource", "vue-router",
  "createApp", "createRoot", "ReactDOM.render",
  "window.__initial_state__", "window.__INITIAL_STATE__",
];

const SHELL_THRESHOLD = 300;
const EMPTY_CONTENT_THRESHOLD = 150;
const STATIC_DOC_THRESHOLD = 500;
const SCRIPT_COUNT_THRESHOLD = 2;

/** 策略编排器。根据页面 HTML 特征决定使用轻量 HTTP 引擎还是浏览器引擎。 */
export class StrategyOrchestrator {
  /**
   * 根据原始 HTML 判断最优采集引擎。
   * @param rawHtml 页面 HTML 源码。
   * @returns "http" — 轻量 HTTP 引擎可用；"browser" — 需要使用浏览器渲染。
   */
  static async decideEngine(rawHtml: string): Promise<"http" | "browser"> {
    const html = rawHtml.trim();

    // 规则 1：包含 SPA 框架标志 → 浏览器
    if (SPA_PATTERNS.some((p) => html.includes(p))) return "browser";

    // 规则 2：多个 <script> 标签 → 浏览器（极可能依赖 JS 渲染）
    const scriptCount = (html.match(/<script[\s>]/gi) || []).length;
    if (scriptCount >= SCRIPT_COUNT_THRESHOLD) return "browser";

    // 规则 3：空壳 SPA（#app / #root + 极少内容）→ 浏览器
    const textContent = html.replace(/<[^>]+>/g, "").trim();
    const hasShellRoot = html.includes("<div id=\"app\"") || html.includes("<div id=\"root\"");
    if (hasShellRoot && textContent.length < EMPTY_CONTENT_THRESHOLD) return "browser";

    // 规则 4：HTML 极小 → 可能只是空白页或重定向页，交给浏览器处理
    if (html.length < SHELL_THRESHOLD) return "browser";

    // 规则 5：明显的静态文档（文章、正文段落）→ 轻量 HTTP
    const hasArticle =
      html.includes("<article") ||
      (html.includes("<main>") && html.includes("<p>"));
    if (hasArticle && textContent.length > STATIC_DOC_THRESHOLD) return "http";

    return "browser";
  }
}
