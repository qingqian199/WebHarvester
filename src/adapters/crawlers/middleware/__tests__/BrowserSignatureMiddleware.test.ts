import { BrowserSignatureMiddleware } from "../BrowserSignatureMiddleware";
import { CrawlContext, CrawlResult } from "../../../../core/ports/ICrawlMiddleware";

const mockHasBrowserSignature = jest.fn();
const mockSignWithBrowser = jest.fn();

jest.mock("../../../../utils/crypto/browser-signature-service", () => ({
  hasBrowserSignature: (...args: any[]) => mockHasBrowserSignature(...args),
  signWithBrowser: (...args: any[]) => mockSignWithBrowser(...args),
}));

function createContext(overrides?: Partial<CrawlContext>): CrawlContext {
  return {
    url: "https://example.com/api/test",
    method: "GET",
    headers: { "User-Agent": "test" },
    site: "test-site",
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

describe("BrowserSignatureMiddleware", () => {
  beforeEach(() => {
    mockHasBrowserSignature.mockReset();
    mockSignWithBrowser.mockReset();
  });

  it("skips signature when site is not registered", async () => {
    mockHasBrowserSignature.mockReturnValue(false);
    const mw = new BrowserSignatureMiddleware();
    const ctx = createContext();
    const next = createNext();
    await mw.process(ctx, next);
    expect(mockSignWithBrowser).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("injects signature headers for registered sites", async () => {
    mockHasBrowserSignature.mockReturnValue(true);
    mockSignWithBrowser.mockResolvedValue({ "X-Bogus": "bogus_value", "X-Gnarly": "gnarly_value" });
    const mw = new BrowserSignatureMiddleware();
    const ctx = createContext();
    const next = createNext();
    await mw.process(ctx, next);
    expect(mockSignWithBrowser).toHaveBeenCalledWith("test-site", ctx.url, ctx.headers, ctx.body, "");
    expect(ctx.headers["X-Bogus"]).toBe("bogus_value");
    expect(ctx.headers["X-Gnarly"]).toBe("gnarly_value");
  });

  it("sets _signedWithBrowser local flag when X-Bogus is present", async () => {
    mockHasBrowserSignature.mockReturnValue(true);
    mockSignWithBrowser.mockResolvedValue({ "X-Bogus": "abc123" });
    const mw = new BrowserSignatureMiddleware();
    const ctx = createContext();
    const next = createNext();
    await mw.process(ctx, next);
    expect(ctx.locals._signedWithBrowser).toBe(true);
  });

  it("silently degrades when signature service throws", async () => {
    mockHasBrowserSignature.mockReturnValue(true);
    mockSignWithBrowser.mockRejectedValue(new Error("service unavailable"));
    const mw = new BrowserSignatureMiddleware();
    const ctx = createContext();
    const next = createNext();
    await expect(mw.process(ctx, next)).resolves.not.toThrow();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("passes cookie string to signWithBrowser", async () => {
    mockHasBrowserSignature.mockReturnValue(true);
    mockSignWithBrowser.mockResolvedValue({});
    const mw = new BrowserSignatureMiddleware();
    const ctx = createContext({
      session: { cookies: [{ name: "sessionid", value: "abc" }, { name: "token", value: "xyz" }] },
    });
    const next = createNext();
    await mw.process(ctx, next);
    expect(mockSignWithBrowser).toHaveBeenCalledWith(
      "test-site", ctx.url, ctx.headers, ctx.body, "sessionid=abc; token=xyz",
    );
  });

  it("does not set _signedWithBrowser when X-Bogus is absent", async () => {
    mockHasBrowserSignature.mockReturnValue(true);
    mockSignWithBrowser.mockResolvedValue({ "X-Gnarly": "val" });
    const mw = new BrowserSignatureMiddleware();
    const ctx = createContext();
    const next = createNext();
    await mw.process(ctx, next);
    expect(ctx.locals._signedWithBrowser).toBeUndefined();
  });

  it("passes through to next and returns its result", async () => {
    mockHasBrowserSignature.mockReturnValue(false);
    const mw = new BrowserSignatureMiddleware();
    const ctx = createContext();
    const expected: CrawlResult = { statusCode: 200, body: "ok", headers: {}, responseTime: 50 };
    const next = createNext(expected);
    const result = await mw.process(ctx, next);
    expect(result).toEqual(expected);
  });
});
