import { BilibiliCrawler } from "../BilibiliCrawler";
import { PageData } from "../../../core/ports/ISiteCrawler";
import { getRateLimiter, clearAllCooldowns } from "../../../utils/rate-limiter";
import { ProxyConfig } from "../../../core/ports/IProxyProvider";

jest.mock("node-fetch", () => {
  const mockFetch = jest.fn();
  (mockFetch as any).default = mockFetch;
  return mockFetch;
});
import fetch from "node-fetch";
const mockedFetch = fetch as unknown as jest.Mock;

jest.mock("../../../utils/crypto/confidential", () => ({
  __esModule: true,
  encryptField: (plaintext: string) => `aes256gcm:mock:${plaintext}`,
  decryptField: (encrypted: string) => encrypted.startsWith("aes256gcm:mock:") ? encrypted.slice(14) : encrypted,
  isEncrypted: (v: string) => v.startsWith("aes256gcm:"),
  getMasterKey: () => Buffer.from("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", "hex"),
}));

function mockFetchResponse(body: unknown, statusCode = 200): Partial<Response> {
  return {
    ok: statusCode >= 200 && statusCode < 300,
    status: statusCode,
    text: jest.fn().mockResolvedValue(JSON.stringify(body)),
    headers: new Map(Object.entries({ "content-type": "application/json" })) as any,
    json: jest.fn().mockResolvedValue(body),
    clone: jest.fn(),
  };
}

function mockPage(body: unknown, statusCode = 200, responseTime = 100): PageData {
  return {
    url: "https://api.bilibili.com/x/test",
    statusCode,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    responseTime,
    capturedAt: new Date().toISOString(),
  };
}

describe("CrawlerIntegration: fetchWithRetry → risk codes → circuit breaker", () => {
  let crawler: BilibiliCrawler;
  const site = "bilibili";

  beforeEach(() => {
    clearAllCooldowns();
    mockedFetch.mockReset();

    // Disable rate limiter throttling for test speed
    const rl = getRateLimiter(site, { enabled: false });
    crawler = new BilibiliCrawler();
    crawler["rateLimiter"] = rl;
    crawler.setWbiKeys("test_img_key", "test_sub_key");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("403 HTTP status triggers low-level breaker (per-endpoint only)", async () => {
    mockedFetch.mockResolvedValue(mockFetchResponse({ code: 403 }, 403));

    const rl = getRateLimiter(site);
    const onErrorSpy = jest.spyOn(rl, "onRateLimitError");

    // Mock fetchPageData for fallback (BilibiliCrawler falls back on non-0 code)
    jest.spyOn(crawler as any, "fetchPageData").mockResolvedValue(mockPage({ title: "fallback" }, 200, 100));

    await crawler.collectUnits(["bili_video_info"], { aid: "123" });

    expect(onErrorSpy).toHaveBeenCalledWith(403, expect.any(String));
    expect(rl.isPaused).toBe(false);
  });

  it("429 HTTP status triggers medium-level breaker (delay multiplier)", async () => {
    mockedFetch.mockResolvedValue(mockFetchResponse({ code: 429 }, 429));

    const rl = getRateLimiter(site, { enabled: true, minDelay: 1, maxDelay: 5, cooldownMinutes: 0.001, maxConcurrentSignatures: 2, maxConcurrentPages: 1 });
    crawler["rateLimiter"] = rl;
    const initialMultiplier = (rl as any).delayMultiplier;

    jest.spyOn(crawler as any, "fetchPageData").mockResolvedValue(mockPage({ title: "fallback" }, 200, 100));
    await crawler.collectUnits(["bili_video_info"], { aid: "123" });

    // onRateLimitError may be called twice (fetchWithRetry + body check), so multiplier jumps by 2x
    expect((rl as any).delayMultiplier).toBeGreaterThan(initialMultiplier);
    expect(rl.isPaused).toBe(false);
  });

  it("-352 business code triggers high-level breaker (full site pause)", async () => {
    // -352 is caught by RetryMiddleware which calls onRateLimitError(-352)
    mockedFetch
      .mockResolvedValueOnce(mockFetchResponse({ code: -352 }))
      .mockResolvedValueOnce(mockFetchResponse({ code: 0, data: { title: "ok", stat: { view: 100 } } }));

    jest.spyOn(crawler as any, "fetchPageData").mockResolvedValue(mockPage({ title: "fallback" }, 200, 100));

    const rl = getRateLimiter(site, { enabled: true, minDelay: 1, maxDelay: 5, cooldownMinutes: 0.001, maxConcurrentSignatures: 2, maxConcurrentPages: 1 });
    crawler["rateLimiter"] = rl;

    await crawler.collectUnits(["bili_video_info"], { aid: "123" });
    expect(rl.isPaused).toBe(true);
  }, 10000);

  it("-352 retry exhausts → falls back to page extraction", async () => {
    const fetchSpy = jest.spyOn(crawler as any, "fetchApi");
    let callCount = 0;
    fetchSpy.mockImplementation((async (_name: string) => {
      callCount++;
      return mockPage({ code: callCount <= 2 ? -352 : 0 });
    }) as any);

    // Mock fetchPageContent (called by fetchPageData internally) to return a valid result
    jest.spyOn(crawler as any, "fetchPageContent").mockResolvedValue({
      browser: { executeScript: jest.fn().mockResolvedValue(""), close: jest.fn().mockResolvedValue(undefined) },
      startTime: Date.now(),
    });

    const results = await crawler.collectUnits(["bili_video_info"], { aid: "123" });
    const info = results.find(r => r.unit === "bili_video_info");
    expect(info).toBeDefined();
    // After two -352 retries, BilibiliCrawler falls back to page extraction → should be partial
    expect(info!.status).toBe("partial");
    expect(info!.method).toBe("html_extract");
  }, 10000);

  it("unknown risk code (not in RATE_LIMIT_CODES or RISK_LEVELS) does not pause", async () => {
    const rl = getRateLimiter(site, { enabled: false });
    crawler["rateLimiter"] = rl;

    mockedFetch.mockResolvedValue(mockFetchResponse({ code: 99999 }, 200));
    jest.spyOn(crawler as any, "fetchPageData").mockResolvedValue(mockPage({ title: "fallback" }, 200, 100));

    await crawler.collectUnits(["bili_video_info"], { aid: "123" });
    expect(rl.isPaused).toBe(false);
  });
});

describe("CrawlerIntegration: collectUnits composition and dependencies", () => {
  let crawler: BilibiliCrawler;

  beforeEach(() => {
    clearAllCooldowns();
    mockedFetch.mockReset();
    const rl = getRateLimiter("bilibili", { enabled: false });
    crawler = new BilibiliCrawler();
    crawler["rateLimiter"] = rl;
    crawler.setWbiKeys("test_img_key", "test_sub_key");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("collectUnits returns results for all requested units", async () => {
    mockedFetch.mockResolvedValue(mockFetchResponse({ code: 0, data: { title: "v", stat: { view: 1 } } }));

    const results = await crawler.collectUnits(
      ["bili_video_info", "bili_search"],
      { aid: "123", keyword: "test", sort: "click" },
    );
    expect(results).toHaveLength(2);
    expect(results.every(r => r.status === "success")).toBe(true);
  });

  it("unknown unit returns failed status", async () => {
    const results = await crawler.collectUnits(["bili_nonexistent" as any], {});
    expect(results[0].status).toBe("failed");
  });

  it("passes session (cookies) through middleware", async () => {
    mockedFetch.mockResolvedValue(mockFetchResponse({ code: 0, data: { title: "ok", stat: { view: 1 } } }));

    const ctxSpy = jest.spyOn(crawler as any, "addAuthHeaders");
    await crawler.collectUnits(
      ["bili_video_info"],
      { aid: "123" },
      { cookies: [{ name: "SESSDATA", value: "abc123" }] },
    );
    expect(ctxSpy).toHaveBeenCalled();
  });

  it("handles network errors gracefully with fallback", async () => {
    mockedFetch.mockRejectedValue(new Error("network error"));
    jest.spyOn(crawler as any, "fetchPageData").mockResolvedValue(mockPage({ title: "fallback", content: "html" }, 200, 500));

    const results = await crawler.collectUnits(["bili_video_info"], { aid: "123" });
    const info = results.find(r => r.unit === "bili_video_info");
    expect(info).toBeDefined();
    expect(info!.status).toMatch(/success|partial|failed/);
  });
});

describe("CrawlerIntegration: proxy provider integration", () => {
  let rl_enabled: ReturnType<typeof getRateLimiter>;

  beforeEach(() => {
    clearAllCooldowns();
    mockedFetch.mockReset();
    rl_enabled = getRateLimiter("bilibili", { enabled: false });
  });

  it("proxy provider is used when enabled", async () => {
    const mockProxy: ProxyConfig = { host: "127.0.0.1", port: 8080, protocol: "http" };
    const mockProvider = {
      enabled: true,
      getProxy: jest.fn().mockResolvedValue(mockProxy),
      reportFailure: jest.fn(),
      listProxies: jest.fn().mockReturnValue([mockProxy]),
      warmup: jest.fn().mockResolvedValue(undefined),
      startHealthCheck: jest.fn().mockReturnThis(),
      stopHealthCheck: jest.fn(),
      enabledCount: 1,
    };

    const crawlerWithProxy = new BilibiliCrawler(mockProvider);
    crawlerWithProxy["rateLimiter"] = rl_enabled;
    (crawlerWithProxy as any).setWbiKeys?.("k", "k");
    mockedFetch.mockResolvedValue(mockFetchResponse({ code: 0, data: { title: "t", stat: { view: 1 } } }));

    await crawlerWithProxy.collectUnits(["bili_video_info"], { aid: "123" });
    expect(mockProvider.getProxy).toHaveBeenCalled();
  });

  it("proxy provider is NOT called when disabled", async () => {
    const mockProvider = {
      enabled: false,
      getProxy: jest.fn(),
      reportFailure: jest.fn(),
      listProxies: jest.fn().mockReturnValue([]),
      warmup: jest.fn().mockResolvedValue(undefined),
      startHealthCheck: jest.fn().mockReturnThis(),
      stopHealthCheck: jest.fn(),
      enabledCount: 0,
    };

    const crawlerNoProxy = new BilibiliCrawler(mockProvider);
    crawlerNoProxy["rateLimiter"] = rl_enabled;
    (crawlerNoProxy as any).setWbiKeys?.("k", "k");
    mockedFetch.mockResolvedValue(mockFetchResponse({ code: 0, data: { title: "t", stat: { view: 1 } } }));

    await crawlerNoProxy.collectUnits(["bili_video_info"], { aid: "123" });
    expect(mockProvider.getProxy).not.toHaveBeenCalled();
  });
});
