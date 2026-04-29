const SHELL_THRESHOLD = 300;
const EMPTY_CONTENT_THRESHOLD = 150;
const STATIC_DOC_THRESHOLD = 500;

export class StrategyOrchestrator {
  static decideEngine(rawHtml: string): "http" | "browser" {
    const html = rawHtml.trim().toLowerCase();

    const isEmptyShell =
      html.length < SHELL_THRESHOLD ||
      ((html.includes("<div id=\"app\"") || html.includes("<div id=\"root\"")) &&
        html.replace(/<[^>]+>/g, "").length < EMPTY_CONTENT_THRESHOLD);

    const needJsRender =
      html.includes("window.__initial_state__") ||
      html.includes("createapp") ||
      html.includes("reactdom.render") ||
      html.includes("vue.runtime");

    const isStaticDoc =
      html.includes("<article") ||
      html.includes("<main>") &&
      html.includes("<p>") &&
      html.replace(/<[^>]+>/g, "").length > STATIC_DOC_THRESHOLD;

    if (isEmptyShell || needJsRender) return "browser";
    if (isStaticDoc) return "http";
    return "browser";
  }
}
