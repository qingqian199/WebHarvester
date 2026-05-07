import { BossSecurityMiddleware } from "../BossSecurityMiddleware";
import { CrawlContext, CrawlResult } from "../../../../core/ports/ICrawlMiddleware";
import { FeatureFlags } from "../../../../core/features";

let mockStoken = "__zp_stoken__mock";
let mockTraceid = "traceid_mock";
let mockCookiesVal: Record<string, string> = { "last-Cookie": "mock_cookie" };

jest.mock("../../../../utils/crypto/boss-zp-token", () => ({
  ZpTokenManager: jest.fn().mockImplementation(() => ({
    waitReady: jest.fn().mockResolvedValue(undefined),
    get stoken() { return mockStoken; },
    get traceid() { return mockTraceid; },
    get cookies() { return mockCookiesVal; },
  })),
}));

jest.mock("../../../../utils/backend-client", () => ({
  getBossToken: () => Promise.resolve({ stoken: "__zp_stoken__be", traceid: "traceid_be", cookies: { "be-cookie": "be_val" } }),
}));

function createMockRateLimiter() {
  return { throttle: jest.fn().mockResolvedValue(undefined), isPaused: false, isEnabled: true };
}

function createContext(overrides?: Partial<CrawlContext>): CrawlContext {
  return { url: "https://www.zhipin.com/api/jobs", method: "GET", headers: {}, site: "boss_zhipin", retryCount: 0, locals: {}, ...overrides };
}

function createNext(result?: Partial<CrawlResult>): () => Promise<CrawlResult> {
  return jest.fn().mockResolvedValue({ statusCode: 200, body: "{}", headers: {}, responseTime: 100, ...result });
}

describe("BossSecurityMiddleware", () => {
  beforeEach(() => {
    mockStoken = "__zp_stoken__mock";
    mockTraceid = "traceid_mock";
    mockCookiesVal = { "last-Cookie": "mock_cookie" };
    FeatureFlags.enableBackendService = false;
  });

  it("injects Cookie with zp_stoken and existing cookies from local token manager", async () => {
    const rateLimiter = createMockRateLimiter();
    const tm = new (jest.requireMock("../../../../utils/crypto/boss-zp-token").ZpTokenManager)();
    const mw = new BossSecurityMiddleware(rateLimiter as any, tm);
    const ctx = createContext();
    const next = createNext();
    await mw.process(ctx, next);
    expect(ctx.headers["Cookie"]).toContain("last-Cookie=mock_cookie");
    expect(ctx.headers["Cookie"]).toContain("__zp_stoken__=__zp_stoken__mock");
  });

  it("injects traceid, x-requested-with, Origin, Referer, Accept headers", async () => {
    const rateLimiter = createMockRateLimiter();
    const tm = new (jest.requireMock("../../../../utils/crypto/boss-zp-token").ZpTokenManager)();
    const mw = new BossSecurityMiddleware(rateLimiter as any, tm);
    const ctx = createContext();
    const next = createNext();
    await mw.process(ctx, next);
    expect(ctx.headers["traceid"]).toBe("traceid_mock");
    expect(ctx.headers["x-requested-with"]).toBe("XMLHttpRequest");
    expect(ctx.headers["Origin"]).toBe("https://www.zhipin.com");
    expect(ctx.headers["Referer"]).toBe("https://www.zhipin.com/web/geek/jobs");
    expect(ctx.headers["Accept"]).toBe("application/json, text/plain, */*");
  });

  it("calls throttle and returns next result", async () => {
    const rateLimiter = createMockRateLimiter();
    const tm = new (jest.requireMock("../../../../utils/crypto/boss-zp-token").ZpTokenManager)();
    const mw = new BossSecurityMiddleware(rateLimiter as any, tm);
    const ctx = createContext();
    const expected: CrawlResult = { statusCode: 200, body: "done", headers: {}, responseTime: 30 };
    const next = createNext(expected);
    const result = await mw.process(ctx, next);
    expect(rateLimiter.throttle).toHaveBeenCalledTimes(1);
    expect(result).toEqual(expected);
  });

  it("uses backend service when enableBackendService is true", async () => {
    FeatureFlags.enableBackendService = true;
    const rateLimiter = createMockRateLimiter();
    const tm = new (jest.requireMock("../../../../utils/crypto/boss-zp-token").ZpTokenManager)();
    const mw = new BossSecurityMiddleware(rateLimiter as any, tm);
    const ctx = createContext();
    const next = createNext();
    await mw.process(ctx, next);
    expect(ctx.headers["Cookie"]).toContain("__zp_stoken__=__zp_stoken__be");
    expect(ctx.headers["Cookie"]).toContain("be-cookie=be_val");
    expect(ctx.headers["traceid"]).toBe("traceid_be");
  });

  it("does not duplicate __zp_stoken__ if already in cookies", async () => {
    mockCookiesVal = { "__zp_stoken__": "existing" };
    const rateLimiter = createMockRateLimiter();
    const tm = new (jest.requireMock("../../../../utils/crypto/boss-zp-token").ZpTokenManager)();
    const mw = new BossSecurityMiddleware(rateLimiter as any, tm);
    const ctx = createContext();
    const next = createNext();
    await mw.process(ctx, next);
    const cookie = ctx.headers["Cookie"] || "";
    const matches = cookie.match(/__zp_stoken__=/g);
    expect(matches).toHaveLength(1);
  });

  it("handles empty cookies from token manager", async () => {
    mockCookiesVal = {};
    const rateLimiter = createMockRateLimiter();
    const tm = new (jest.requireMock("../../../../utils/crypto/boss-zp-token").ZpTokenManager)();
    const mw = new BossSecurityMiddleware(rateLimiter as any, tm);
    const ctx = createContext();
    const next = createNext();
    await mw.process(ctx, next);
    expect(ctx.headers["Cookie"]).toBe("__zp_stoken__=__zp_stoken__mock");
  });

  it("skips __zp_stoken__ injection when stoken is empty", async () => {
    mockStoken = "";
    mockCookiesVal = { "some-cookie": "val" };
    const rateLimiter = createMockRateLimiter();
    const tm = new (jest.requireMock("../../../../utils/crypto/boss-zp-token").ZpTokenManager)();
    const mw = new BossSecurityMiddleware(rateLimiter as any, tm);
    const ctx = createContext();
    const next = createNext();
    await mw.process(ctx, next);
    expect(ctx.headers["Cookie"]).toBe("some-cookie=val");
  });

  it("skips traceid injection when traceid is empty", async () => {
    mockTraceid = "";
    mockCookiesVal = { "x": "y" };
    const rateLimiter = createMockRateLimiter();
    const tm = new (jest.requireMock("../../../../utils/crypto/boss-zp-token").ZpTokenManager)();
    const mw = new BossSecurityMiddleware(rateLimiter as any, tm);
    const ctx = createContext();
    const next = createNext();
    await mw.process(ctx, next);
    expect(ctx.headers["traceid"]).toBeUndefined();
  });

  it("skips Cookie header when both stoken and cookies are empty", async () => {
    mockStoken = "";
    mockCookiesVal = {};
    const rateLimiter = createMockRateLimiter();
    const tm = new (jest.requireMock("../../../../utils/crypto/boss-zp-token").ZpTokenManager)();
    const mw = new BossSecurityMiddleware(rateLimiter as any, tm);
    const ctx = createContext();
    const next = createNext();
    await mw.process(ctx, next);
    expect(ctx.headers["Cookie"]).toBeUndefined();
  });
});
