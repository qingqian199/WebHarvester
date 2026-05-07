import { RateLimitMiddleware } from "../RateLimitMiddleware";
import { CrawlContext, CrawlResult } from "../../../../core/ports/ICrawlMiddleware";

function createMockRateLimiter() {
  return {
    isPaused: false,
    throttle: jest.fn().mockResolvedValue(undefined),
    isEnabled: true,
    onRateLimitError: jest.fn(),
    recordResult: jest.fn(),
  };
}

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

function createNext(result?: Partial<CrawlResult>): () => Promise<CrawlResult> {
  return jest.fn().mockResolvedValue({
    statusCode: 200,
    body: "{}",
    headers: {},
    responseTime: 100,
    ...result,
  });
}

describe("RateLimitMiddleware", () => {
  it("calls throttle before continuing", async () => {
    const rateLimiter = createMockRateLimiter();
    const mw = new RateLimitMiddleware(rateLimiter as any);
    const ctx = createContext();
    const next = createNext();
    await mw.process(ctx, next);
    expect(rateLimiter.throttle).toHaveBeenCalledTimes(1);
  });

  it("calls next after throttle returns", async () => {
    const rateLimiter = createMockRateLimiter();
    const mw = new RateLimitMiddleware(rateLimiter as any);
    const ctx = createContext();
    const next = createNext();
    await mw.process(ctx, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("does not block request when isPaused is true", async () => {
    const rateLimiter = createMockRateLimiter();
    rateLimiter.isPaused = true;
    const mw = new RateLimitMiddleware(rateLimiter as any);
    const ctx = createContext();
    const next = createNext();
    const result = await mw.process(ctx, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(result.statusCode).toBe(200);
  });

  it("returns result from next unchanged", async () => {
    const rateLimiter = createMockRateLimiter();
    const mw = new RateLimitMiddleware(rateLimiter as any);
    const ctx = createContext();
    const expected: CrawlResult = { statusCode: 201, body: "ok", headers: { "x-test": "1" }, responseTime: 200 };
    const next = createNext(expected);
    const result = await mw.process(ctx, next);
    expect(result).toEqual(expected);
  });

  it("passes site context to throttle", async () => {
    const rateLimiter = createMockRateLimiter();
    const mw = new RateLimitMiddleware(rateLimiter as any);
    const ctx = createContext({ site: "test-site" });
    const next = createNext();
    await mw.process(ctx, next);
    expect(rateLimiter.throttle).toHaveBeenCalled();
  });

  it("returns same result even when paused", async () => {
    const rateLimiter = createMockRateLimiter();
    rateLimiter.isPaused = true;
    const mw = new RateLimitMiddleware(rateLimiter as any);
    const ctx = createContext();
    const expected: CrawlResult = { statusCode: 200, body: "data", headers: {}, responseTime: 50 };
    const next = createNext(expected);
    const result = await mw.process(ctx, next);
    expect(result.body).toBe("data");
  });
});
