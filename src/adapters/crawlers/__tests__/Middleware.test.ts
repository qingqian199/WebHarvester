import { FingerprintMiddleware } from "../middleware/FingerprintMiddleware";
import { BodyTruncationMiddleware } from "../middleware/BodyTruncationMiddleware";
import { RetryMiddleware } from "../middleware/RetryMiddleware";
import { CrawlContext } from "../../../core/ports/ICrawlMiddleware";
import { SiteRateLimiter } from "../../../utils/rate-limiter";

describe("FingerprintMiddleware", () => {
  it("adds browser-like headers to context", async () => {
    const mw = new FingerprintMiddleware(() => "https://www.example.com/");
    const ctx: CrawlContext = { url: "https://www.example.com/api", method: "GET", headers: {}, site: "test", retryCount: 0, locals: {} };
    let nextCtx: CrawlContext | undefined;
    const result = await mw.process(ctx, async () => {
      nextCtx = ctx;
      return { statusCode: 200, body: "", headers: {}, responseTime: 0 };
    });
    expect(result.statusCode).toBe(200);
    expect(nextCtx!.headers["User-Agent"]).toBeTruthy();
    expect(nextCtx!.headers["sec-ch-ua"]).toBeTruthy();
    expect(nextCtx!.headers["Referer"]).toBe("https://www.example.com/");
  });

  it("adds Cookie header when session provided", async () => {
    const mw = new FingerprintMiddleware();
    const ctx: CrawlContext = {
      url: "https://example.com", method: "GET", headers: {},
      session: { cookies: [{ name: "sid", value: "abc123" }] },
      site: "test", retryCount: 0, locals: {},
    };
    let nextCtx: CrawlContext | undefined;
    await mw.process(ctx, async () => { nextCtx = ctx; return { statusCode: 200, body: "", headers: {}, responseTime: 0 }; });
    expect(nextCtx!.headers["Cookie"]).toContain("sid=abc123");
  });
});

describe("BodyTruncationMiddleware", () => {
  it("truncates body over maxSize", async () => {
    const mw = new BodyTruncationMiddleware(10);
    const result = await mw.process(
      { url: "", method: "GET", headers: {}, site: "t", retryCount: 0, locals: {} },
      async () => ({ statusCode: 200, body: "a".repeat(100), headers: {}, responseTime: 0 }),
    );
    expect(result.body.length).toBe(10);
  });

  it("does not truncate body under maxSize", async () => {
    const mw = new BodyTruncationMiddleware(100);
    const result = await mw.process(
      { url: "", method: "GET", headers: {}, site: "t", retryCount: 0, locals: {} },
      async () => ({ statusCode: 200, body: "short", headers: {}, responseTime: 0 }),
    );
    expect(result.body).toBe("short");
  });
});

describe("RetryMiddleware", () => {
  it("passes through on success", async () => {
    const rl = new SiteRateLimiter("test", { enabled: false, minDelay: 1, maxDelay: 1, cooldownMinutes: 1, maxConcurrentSignatures: 2, maxConcurrentPages: 1 });
    const mw = new RetryMiddleware(rl, 1, 1);

    const result = await mw.process(
      { url: "", method: "GET", headers: {}, site: "test", retryCount: 0, locals: {} },
      async () => ({ statusCode: 200, body: "{\"code\":0}", headers: {}, responseTime: 0 }),
    );
    expect(result.statusCode).toBe(200);
  });

  it("retries on rate-limit code", async () => {
    const rl = new SiteRateLimiter("bilibili", { enabled: false, minDelay: 1, maxDelay: 1, cooldownMinutes: 1, maxConcurrentSignatures: 2, maxConcurrentPages: 1 });
    const mw = new RetryMiddleware(rl, 1, 1);
    let callCount = 0;

    const result = await mw.process(
      { url: "", method: "GET", headers: {}, site: "bilibili", retryCount: 0, locals: {} },
      async () => {
        callCount++;
        if (callCount < 2) return { statusCode: 200, body: "{\"code\":-352}", headers: {}, responseTime: 0 };
        return { statusCode: 200, body: "{\"code\":0}", headers: {}, responseTime: 0 };
      },
    );
    expect(callCount).toBe(2);
    expect(result.statusCode).toBe(200);
  });

  it("throws after exhausting retries", async () => {
    const rl = new SiteRateLimiter("bilibili", { enabled: false, minDelay: 1, maxDelay: 1, cooldownMinutes: 1, maxConcurrentSignatures: 2, maxConcurrentPages: 1 });
    const mw = new RetryMiddleware(rl, 1, 1);

    await expect(mw.process(
      { url: "", method: "GET", headers: {}, site: "bilibili", retryCount: 0, locals: {} },
      async () => ({ statusCode: 200, body: "{\"code\":-352}", headers: {}, responseTime: 0 }),
    )).rejects.toThrow("重试耗尽");
  });
});
