import { RetryMiddleware } from "../RetryMiddleware";
import { CrawlContext, CrawlResult } from "../../../../core/ports/ICrawlMiddleware";

jest.mock("../../../../utils/rate-limiter", () => {
  const actual = jest.requireActual("../../../../utils/rate-limiter");
  return { ...actual, RATE_LIMIT_CODES: { test_site: [300011], xiaohongshu: [300011] } };
});

function createMockRateLimiter() {
  return { onRateLimitError: jest.fn(), throttle: jest.fn().mockResolvedValue(undefined), isPaused: false, isEnabled: true, recordResult: jest.fn() };
}

function createContext(overrides?: Partial<CrawlContext>): CrawlContext {
  return { url: "https://example.com/api/test", method: "GET", headers: {}, site: "test_site", retryCount: 0, locals: {}, ...overrides };
}

function createNext(result: Partial<CrawlResult>): () => Promise<CrawlResult> {
  return jest.fn().mockResolvedValue({ statusCode: 200, body: "{}", headers: {}, responseTime: 100, ...result });
}

describe("RetryMiddleware", () => {
  it("passes through on successful response", async () => {
    const rateLimiter = createMockRateLimiter();
    const mw = new RetryMiddleware(rateLimiter as any, 1, 100);
    const ctx = createContext();
    const next = createNext({ statusCode: 200, body: JSON.stringify({ code: 0, data: "ok" }) });
    const result = await mw.process(ctx, next);
    expect(result.statusCode).toBe(200);
    expect(rateLimiter.onRateLimitError).not.toHaveBeenCalled();
  });

  it("retries on known rate limit code and calls onRateLimitError", async () => {
    const rateLimiter = createMockRateLimiter();
    const mw = new RetryMiddleware(rateLimiter as any, 1, 10);
    const ctx = createContext();
    const rateLimitedBody = JSON.stringify({ code: 300011 });
    const next = jest
      .fn()
      .mockResolvedValueOnce({ statusCode: 200, body: rateLimitedBody, headers: {}, responseTime: 50 })
      .mockResolvedValueOnce({ statusCode: 200, body: JSON.stringify({ code: 0 }), headers: {}, responseTime: 50 });
    const result = await mw.process(ctx, next);
    expect(next).toHaveBeenCalledTimes(2);
    expect(rateLimiter.onRateLimitError).toHaveBeenCalledWith(300011, "/api/test");
    expect(result.statusCode).toBe(200);
  });

  it("throws error after exhausting retries", async () => {
    const rateLimiter = createMockRateLimiter();
    const mw = new RetryMiddleware(rateLimiter as any, 1, 10);
    const ctx = createContext();
    const rateLimitedBody = JSON.stringify({ code: 300011 });
    const next = createNext({ statusCode: 200, body: rateLimitedBody });
    await expect(mw.process(ctx, next)).rejects.toThrow("重试耗尽");
  });

  it("passes through on non-matching error code", async () => {
    const rateLimiter = createMockRateLimiter();
    const mw = new RetryMiddleware(rateLimiter as any, 1, 100);
    const ctx = createContext();
    const body = JSON.stringify({ code: 99999 });
    const next = createNext({ statusCode: 200, body });
    const result = await mw.process(ctx, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(result.body).toBe(body);
  });

  it("passes through on malformed JSON body", async () => {
    const rateLimiter = createMockRateLimiter();
    const mw = new RetryMiddleware(rateLimiter as any, 1, 100);
    const ctx = createContext();
    const next = createNext({ statusCode: 200, body: "not-json" });
    await mw.process(ctx, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("triggers xiaohongshu-specific warning on code 300011 and xiaohongshu site", async () => {
    const rateLimiter = createMockRateLimiter();
    const mw = new RetryMiddleware(rateLimiter as any, 2, 10);
    const ctx = createContext({ site: "xiaohongshu" });
    const rateLimitedBody = JSON.stringify({ code: 300011 });
    const next = jest
      .fn()
      .mockResolvedValueOnce({ statusCode: 200, body: rateLimitedBody, headers: {}, responseTime: 50 })
      .mockResolvedValueOnce({ statusCode: 200, body: JSON.stringify({ code: 0 }), headers: {}, responseTime: 50 });
    const result = await mw.process(ctx, next);
    expect(result.statusCode).toBe(200);
    expect(rateLimiter.onRateLimitError).toHaveBeenCalledWith(300011, "/api/test");
  });

  it("handles unknown site with no rate limit codes (rlCodes is [])", async () => {
    const rateLimiter = createMockRateLimiter();
    const mw = new RetryMiddleware(rateLimiter as any, 1, 10);
    const ctx = createContext({ site: "unknown_site" });
    const next = createNext({ statusCode: 200, body: JSON.stringify({ code: 0 }) });
    const result = await mw.process(ctx, next);
    expect(result.statusCode).toBe(200);
  });

  it("handles retry exhaustion with undefined ctx.url (covers endpoint ternary)", async () => {
    const rateLimiter = createMockRateLimiter();
    const mw = new RetryMiddleware(rateLimiter as any, 1, 10);
    const ctx = createContext({ site: "test_site", url: "" });
    const rateLimitedBody = JSON.stringify({ code: 300011 });
    const next = createNext({ statusCode: 200, body: rateLimitedBody });
    await expect(mw.process(ctx, next)).rejects.toThrow("重试耗尽");
  });
});
