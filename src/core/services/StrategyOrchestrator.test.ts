import { StrategyOrchestrator } from "./StrategyOrchestrator";

describe("StrategyOrchestrator", () => {
  it("returns 'http' for a simple static article page", async () => {
    const html = `<!DOCTYPE html>
<html><head><title>Article</title></head>
<body>
<main>
  <h1>Title</h1>
  <p>Some paragraph text that makes this a real document with enough content to exceed the static document threshold of five hundred characters easily by adding more and more words until we get there.</p>
  <p>More paragraphs. And more. And more. And more. And more. And more. And more paragraphs to add more text so that the total text content length exceeds five hundred characters which is the threshold for static document detection in the strategy orchestrator.</p>
  <p>This is clearly a static HTML page with no JavaScript framework. It has simple HTML tags and text content. No script tags at all. Just pure readable content that anyone can view in any browser without needing JavaScript execution at all. Perfect candidate for lightweight HTTP engine.</p>
</main>
</body></html>`;
    expect(await StrategyOrchestrator.decideEngine(html)).toBe("http");
  });

  it("returns 'http' for an <article> page without scripts", async () => {
    const paras = Array.from({ length: 12 }, (_, i) => `<p>This is paragraph number ${i + 1} inside an article element. It contains enough text to simulate a real content page with substantial written material that would be considered a static document suitable for lightweight HTTP engine rather than requiring a full browser render. The strategy orchestrator should detect this pattern and return http engine decision.</p>`).join("\n");
    const html = `<!DOCTYPE html><html><body><article><h1>Post Title</h1>${paras}</article></body></html>`;
    expect(await StrategyOrchestrator.decideEngine(html)).toBe("http");
  });

  it("returns 'browser' for HTML containing __NUXT__", async () => {
    const html = `<!DOCTYPE html>
<html><body>
<div id="__NUXT__">{"data":"some state"}</div>
</body></html>`;
    expect(await StrategyOrchestrator.decideEngine(html)).toBe("browser");
  });

  it("returns 'browser' for HTML containing __NEXT_DATA__", async () => {
    expect(await StrategyOrchestrator.decideEngine("<script>__NEXT_DATA__</script>")).toBe("browser");
  });

  it("returns 'browser' for HTML with ng-version", async () => {
    expect(await StrategyOrchestrator.decideEngine("<app ng-version=\"15.0.0\">")).toBe("browser");
  });

  it("returns 'browser' for HTML with createRoot (React 18+)", async () => {
    expect(await StrategyOrchestrator.decideEngine("<script>createRoot(document.getElementById('root'))</script>")).toBe("browser");
  });

  it("returns 'browser' when more than 2 <script> tags", async () => {
    const html = `<!DOCTYPE html>
<html><head>
<script src="a.js"></script>
<script src="b.js"></script>
<script src="c.js"></script>
</head><body><p>Some text</p></body></html>`;
    expect(await StrategyOrchestrator.decideEngine(html)).toBe("browser");
  });

  it("returns 'browser' for tiny HTML (likely empty/redirect)", async () => {
    expect(await StrategyOrchestrator.decideEngine("<html><head></head><body></body></html>")).toBe("browser");
  });

  it("returns 'browser' for shell SPA with <div id='app'> and little content", async () => {
    const html = `<!DOCTYPE html>
<html><body>
<div id="app"></div>
<script src="app.js"></script>
</body></html>`;
    expect(await StrategyOrchestrator.decideEngine(html)).toBe("browser");
  });

  it("returns 'browser' for React shell with #root and empty text", async () => {
    const html = `<!DOCTYPE html>
<html><body>
<div id="root"></div>
<script src="bundle.js"></script>
</body></html>`;
    expect(await StrategyOrchestrator.decideEngine(html)).toBe("browser");
  });

  it("returns 'browser' for default/fallback", async () => {
    const html = "<html><body><p>Short text</p></body></html>";
    expect(await StrategyOrchestrator.decideEngine(html)).toBe("browser");
  });

  it("handles empty string input", async () => {
    expect(await StrategyOrchestrator.decideEngine("")).toBe("browser");
  });
});
