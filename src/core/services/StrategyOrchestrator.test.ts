import fetch from "node-fetch";
import { StrategyOrchestrator } from "./StrategyOrchestrator";

jest.mock("node-fetch");
const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

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

describe("StrategyOrchestrator.scout", () => {
  beforeEach(() => {
    StrategyOrchestrator.clearCache();
    jest.clearAllMocks();
  });

  it("returns 'browser' for Cloudflare 503 JS challenge", async () => {
    mockFetch.mockResolvedValueOnce({
      status: 503,
      text: () => Promise.resolve("<html><body>Just a moment... <script src=\"/cdn-cgi/challenge-platform/scripts/main.js\"></script></body></html>"),
      headers: new Map(),
      ok: false,
    } as any);

    const result = await StrategyOrchestrator.scout("https://example.com");
    expect(result).toBe("browser");
  });

  it("returns 'http' for a normal static page", async () => {
    const paras = Array.from({ length: 20 }, (_, i) => `<p>This is paragraph number ${i + 1} with enough text to simulate a real content page that should be detected as static document http engine decision.</p>`).join("\n");
    mockFetch.mockResolvedValueOnce({
      status: 200,
      text: () => Promise.resolve(`<!DOCTYPE html><html><body><main><article>${paras}</article></main></body></html>`),
      headers: new Map(),
      ok: true,
    } as any);

    const result = await StrategyOrchestrator.scout("https://static.example.com");
    expect(result).toBe("http");
  });

  it("follows 302 redirect then evaluates", async () => {
    const paras = Array.from({ length: 20 }, (_, i) => `<p>Paragraph ${i + 1} with enough text content here to make this a static document that should pass the orchestrator threshold of five hundred characters easily.</p>`).join("\n");
    mockFetch
      .mockResolvedValueOnce({
        status: 302,
        headers: new Map([["location", "https://final.example.com/page"]]),
        text: () => Promise.resolve(""),
        ok: false,
      } as any)
      .mockResolvedValueOnce({
        status: 200,
        text: () => Promise.resolve(`<html><body><main>${paras}</main></body></html>`),
        headers: new Map(),
        ok: true,
      } as any);

    const result = await StrategyOrchestrator.scout("https://redirect.example.com");
    expect(result).toBe("http");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("returns 'browser' for SPA pages", async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      text: () => Promise.resolve("<html><body><div id=\"app\"></div><script src=\"app.js\"></script></body></html>"),
      headers: new Map(),
      ok: true,
    } as any);

    const result = await StrategyOrchestrator.scout("https://spa.example.com");
    expect(result).toBe("browser");
  });

  it("returns cached result for same domain within TTL", async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      text: () => Promise.resolve("<html><body><main><p>".repeat(50) + "</p></main></body></html>"),
      headers: new Map(),
      ok: true,
    } as any);

    await StrategyOrchestrator.scout("https://cached.example.com");
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // 第二次调用同一域名—应命中缓存
    await StrategyOrchestrator.scout("https://cached.example.com/page2");
    expect(mockFetch).toHaveBeenCalledTimes(1); // 未增加
  });

  it("handles fetch error gracefully", async () => {
    mockFetch.mockRejectedValueOnce(new Error("timeout"));

    const result = await StrategyOrchestrator.scout("https://error.example.com");
    expect(result).toBe("browser");
  });

  it("cache size reflects distinct domains", async () => {
    expect(StrategyOrchestrator.cacheSize).toBe(0);
    mockFetch.mockResolvedValue({ status: 200, text: () => Promise.resolve("ok"), headers: new Map(), ok: true } as any);

    await StrategyOrchestrator.scout("https://a.com");
    await StrategyOrchestrator.scout("https://b.com");
    expect(StrategyOrchestrator.cacheSize).toBe(2);
  });
});
