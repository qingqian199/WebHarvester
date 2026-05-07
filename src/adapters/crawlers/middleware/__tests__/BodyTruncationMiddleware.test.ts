import { BodyTruncationMiddleware } from "../BodyTruncationMiddleware";
import { CrawlContext, CrawlResult } from "../../../../core/ports/ICrawlMiddleware";

function createContext(overrides?: Partial<CrawlContext>): CrawlContext {
  return {
    url: "https://example.com/api",
    method: "GET",
    headers: {},
    site: "test",
    retryCount: 0,
    locals: {},
    ...overrides,
  };
}

function createNext(result: Partial<CrawlResult>): () => Promise<CrawlResult> {
  return jest.fn().mockResolvedValue({
    statusCode: 200,
    body: "",
    headers: {},
    responseTime: 100,
    ...result,
  });
}

describe("BodyTruncationMiddleware", () => {
  it("does not truncate JSON responses (Content-Type: application/json)", async () => {
    const mw = new BodyTruncationMiddleware(50);
    const ctx = createContext();
    const longJson = "{\"data\":\"" + "a".repeat(100) + "\"}";
    const next = createNext({
      body: longJson,
      headers: { "content-type": "application/json" },
    });
    const result = await mw.process(ctx, next);
    expect(result.body).toBe(longJson);
  });

  it("truncates non-JSON responses exceeding maxSize", async () => {
    const mw = new BodyTruncationMiddleware(20);
    const ctx = createContext();
    const longHtml = "<html>" + "a".repeat(50) + "</html>";
    const next = createNext({
      body: longHtml,
      headers: { "content-type": "text/html" },
    });
    const result = await mw.process(ctx, next);
    expect(result.body.length).toBe(20);
    expect(result.body).toBe(longHtml.slice(0, 20));
  });

  it("does not truncate responses under maxSize", async () => {
    const mw = new BodyTruncationMiddleware(1000);
    const ctx = createContext();
    const body = "short response";
    const next = createNext({ body, headers: { "content-type": "text/plain" } });
    const result = await mw.process(ctx, next);
    expect(result.body).toBe(body);
  });

  it("does not modify result headers or statusCode", async () => {
    const mw = new BodyTruncationMiddleware(5);
    const ctx = createContext();
    const next = createNext({
      statusCode: 500,
      body: "error body",
      headers: { "x-error": "true" },
    });
    const result = await mw.process(ctx, next);
    expect(result.statusCode).toBe(500);
    expect(result.headers["x-error"]).toBe("true");
  });

  it("treats unknown content-type as non-JSON and truncates", async () => {
    const mw = new BodyTruncationMiddleware(10);
    const ctx = createContext();
    const body = "a".repeat(50);
    const next = createNext({ body, headers: { "content-type": "application/octet-stream" } });
    const result = await mw.process(ctx, next);
    expect(result.body.length).toBe(10);
  });

  it("uses default maxSize (200000) when no argument provided", async () => {
    const mw = new BodyTruncationMiddleware();
    const ctx = createContext();
    const body = "a".repeat(150000);
    const next = createNext({ body, headers: { "content-type": "text/plain" } });
    const result = await mw.process(ctx, next);
    expect(result.body.length).toBe(150000);
  });

  it("recognizes Content-Type header with capital C", async () => {
    const mw = new BodyTruncationMiddleware(50);
    const ctx = createContext();
    const longJson = "{\"data\":\"" + "a".repeat(100) + "\"}";
    const next = createNext({
      body: longJson,
      headers: { "Content-Type": "application/json" },
    });
    const result = await mw.process(ctx, next);
    expect(result.body).toBe(longJson);
  });
});
