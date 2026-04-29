export class StrategyOrchestrator {
  static decideEngine(rawHtml: string): "http" | "browser" {
    const html = rawHtml.trim().toLowerCase();

    const isEmptyShell =
      html.length < 300 ||
      ((html.includes("<div id=\"app\"") || html.includes("<div id=\"root\"")) &&
        html.replace(/<[^>]+>/g, "").length < 150);

    const needJsRender =
      html.includes("window.__initial_state__") ||
      html.includes("createapp") ||
      html.includes("reactdom.render") ||
      html.includes("vue.runtime");

    const isStaticDoc =
      html.includes("<article") ||
      html.includes("<main>") &&
      html.includes("<p>") &&
      html.replace(/<[^>]+>/g, "").length > 500;

    if (isEmptyShell || needJsRender) return "browser";
    if (isStaticDoc) return "http";
    return "browser";
  }
}
