import { FingerprintMiddleware } from "../FingerprintMiddleware";
import { CrawlContext, CrawlResult } from "../../../../core/ports/ICrawlMiddleware";

jest.mock("../../../RealisticFingerprintProvider", () => ({
  RealisticFingerprintProvider: jest.fn().mockImplementation(() => ({
    getFingerprint: () => ({
      userAgent: "Mozilla/5.0 Test",
      secChUa: "\"Test Browser\";v=\"100\"",
      platform: "Windows",
      language: "zh-CN",
    }),
  })),
}));

jest.mock("../../../../utils/browser-env", () => ({
  buildBrowserHeaders: () => ({
    "User-Agent": "Mozilla/5.0 Test",
    "sec-ch-ua": "\"Test Browser\";v=\"100\"",
    Accept: "*/*",
  }),
}));

function createContext(overrides?: Partial<CrawlContext>): CrawlContext {
  return {
    url: "https://example.com/api/test",
    method: "GET",
    headers: {},
    site: "test",
    retryCount: 0,
    locals: {},
    ...overrides,
  };
}

function createNext(result?: Partial<CrawlResult>): () => Promise<CrawlResult> {
  return jest.fn().mockResolvedValue({
    statusCode: 200,
    body: "{}",
    headers: {},
    responseTime: 100,
    ...result,
  });
}

describe("FingerprintMiddleware", () => {
  it("injects browser headers into context via Object.assign", async () => {
    const mw = new FingerprintMiddleware();
    const ctx = createContext();
    const next = createNext();
    await mw.process(ctx, next);
    expect(ctx.headers["User-Agent"]).toBe("Mozilla/5.0 Test");
    expect(ctx.headers["sec-ch-ua"]).toBe("\"Test Browser\";v=\"100\"");
  });

  it("sets Cookie header from session cookies", async () => {
    const mw = new FingerprintMiddleware();
    const ctx = createContext({
      session: { cookies: [{ name: "a1", value: "test123" }] },
    });
    const next = createNext();
    await mw.process(ctx, next);
    expect(ctx.headers["Cookie"]).toBe("a1=test123");
  });

  it("sets Content-Type for POST requests with body", async () => {
    const mw = new FingerprintMiddleware();
    const ctx = createContext({ method: "POST", body: "{\"key\":\"value\"}" });
    const next = createNext();
    await mw.process(ctx, next);
    expect(ctx.headers["Content-Type"]).toBe("application/json;charset=UTF-8");
  });

  it("calls next and returns its result", async () => {
    const mw = new FingerprintMiddleware();
    const ctx = createContext();
    const expected: CrawlResult = { statusCode: 200, body: "{}", headers: {}, responseTime: 50 };
    const next = createNext(expected);
    const result = await mw.process(ctx, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(result).toEqual(expected);
  });

  it("handles empty session cookies gracefully", async () => {
    const mw = new FingerprintMiddleware();
    const ctx = createContext({ session: { cookies: [] } });
    const next = createNext();
    await mw.process(ctx, next);
    expect(ctx.headers["Cookie"]).toBeUndefined();
  });

  it("uses custom referer function", async () => {
    const getReferer = jest.fn().mockReturnValue("https://custom.example.com/");
    const mw = new FingerprintMiddleware(getReferer);
    const ctx = createContext({ url: "https://example.com/page" });
    const next = createNext();
    await mw.process(ctx, next);
    expect(getReferer).toHaveBeenCalledWith("https://example.com/page");
  });
});
