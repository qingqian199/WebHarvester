import { registerBrowserSignature, unregisterBrowserSignature, hasBrowserSignature } from "../browser-signature-service";
import { BrowserSignatureMiddleware } from "../../../adapters/crawlers/middleware/BrowserSignatureMiddleware";
import { CrawlContext } from "../../../core/ports/ICrawlMiddleware";

describe("BrowserSignatureService", () => {
  afterEach(() => {
    unregisterBrowserSignature("test-site");
  });

  it("register and check site", () => {
    expect(hasBrowserSignature("test-site")).toBe(false);
    registerBrowserSignature("test-site", { port: 9999, healthEndpoint: "/health", signatureEndpoint: "/sign" });
    expect(hasBrowserSignature("test-site")).toBe(true);
  });

  it("unregister removes site", () => {
    registerBrowserSignature("test-site", { port: 9999, healthEndpoint: "/health", signatureEndpoint: "/sign" });
    unregisterBrowserSignature("test-site");
    expect(hasBrowserSignature("test-site")).toBe(false);
  });
});

describe("BrowserSignatureMiddleware", () => {
  it("passes through when no signature service registered", async () => {
    const mw = new BrowserSignatureMiddleware();
    let nextCalled = false;
    const ctx: CrawlContext = { url: "https://example.com/api", method: "GET", headers: {}, site: "unknown", retryCount: 0, locals: {} };
    const result = await mw.process(ctx, async () => { nextCalled = true; return { statusCode: 200, body: "ok", headers: {}, responseTime: 0 }; });
    expect(nextCalled).toBe(true);
    expect(result.statusCode).toBe(200);
  });

  it("does not block the request on service error", async () => {
    registerBrowserSignature("error-site", { port: 1, healthEndpoint: "/health", signatureEndpoint: "/sign" });
    const mw = new BrowserSignatureMiddleware();
    let nextCalled = false;
    const ctx: CrawlContext = { url: "https://example.com/api", method: "GET", headers: {}, site: "error-site", retryCount: 0, locals: {} };
    const result = await mw.process(ctx, async () => { nextCalled = true; return { statusCode: 200, body: "ok", headers: {}, responseTime: 0 }; });
    expect(nextCalled).toBe(true);
    expect(result.statusCode).toBe(200);
  });
});
