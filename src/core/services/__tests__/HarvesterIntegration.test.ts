import { HarvesterService } from "../HarvesterService";
import { ILogger } from "../../ports/ILogger";
import { IBrowserAdapter } from "../../ports/IBrowserAdapter";
import { IStorageAdapter } from "../../ports/IStorageAdapter";
import { ILightHttpEngine } from "../../ports/ILightHttpEngine";
import { CrawlerDispatcher } from "../CrawlerDispatcher";
import { ISiteCrawler, PageData } from "../../ports/ISiteCrawler";
import { StrategyOrchestrator } from "../StrategyOrchestrator";

function stubLogger(): ILogger {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
}

function stubBrowser(): IBrowserAdapter {
  return {
    launch: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    performActions: jest.fn().mockResolvedValue(undefined),
    captureNetworkRequests: jest.fn().mockResolvedValue([]),
    queryElements: jest.fn().mockResolvedValue([]),
    getStorage: jest.fn().mockResolvedValue({ localStorage: {}, sessionStorage: {}, cookies: [] }),
    executeScript: jest.fn().mockResolvedValue(""),
    getPageMetrics: jest.fn().mockReturnValue(null),
    getPageDiagnostics: jest.fn().mockReturnValue({ consoleMessages: [], pageErrors: [] }),
  };
}

function stubStorage(): IStorageAdapter {
  return { save: jest.fn().mockResolvedValue(undefined) };
}

const STATIC_HTML = "<html><head><title>Test</title></head><body><div id=\"main\"><p>Lorem ipsum dolor sit amet consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.</p></div></body></html>";

function stubHttpEngine(result?: { html: string; statusCode: number; responseTime: number }): ILightHttpEngine {
  return {
    fetch: jest.fn().mockResolvedValue(
      result ?? { html: STATIC_HTML, statusCode: 200, responseTime: 50 },
    ),
  };
}

function stubCrawler(name: string, domain: string, willMatch: boolean): ISiteCrawler {
  return {
    name,
    domain,
    matches: (_url: string) => willMatch,
    fetch: jest.fn().mockImplementation(async (url: string) => ({
      url, statusCode: 200, body: JSON.stringify({ data: "crawler result" }), headers: { "content-type": "application/json" },
      responseTime: 10, capturedAt: new Date().toISOString(),
    } as PageData)),
  };
}

describe("HarvesterService integration: scout → HTTP engine → Playwright fallback", () => {
  let logger: ILogger;
  let browser: IBrowserAdapter;
  let storage: IStorageAdapter;

  beforeEach(() => {
    logger = stubLogger();
    browser = stubBrowser();
    storage = stubStorage();
    // Mock StrategyOrchestrator to return "http" for both scout and decideEngine
    jest.spyOn(StrategyOrchestrator, "scout").mockResolvedValue("http");
    jest.spyOn(StrategyOrchestrator, "decideEngine").mockResolvedValue("http");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("uses crawler dispatcher when a specialized crawler matches", async () => {
    const dispatcher = new CrawlerDispatcher();
    const crawler = stubCrawler("test-crawler", "example.com", true);
    dispatcher.register(crawler);

    const svc = new HarvesterService(logger, browser, storage, undefined, dispatcher);
    const result = await svc.harvest({ targetUrl: "https://example.com/page" });

    expect(result.targetUrl).toBe("https://example.com/page");
    expect(crawler.fetch).toHaveBeenCalled();
    expect(storage.save).toHaveBeenCalled();
  });

  it("falls through to HTTP engine when no crawler matches", async () => {
    const dispatcher = new CrawlerDispatcher();
    dispatcher.register(stubCrawler("other", "other.com", false));

    const httpEngine = stubHttpEngine();
    const svc = new HarvesterService(logger, browser, storage, httpEngine, dispatcher);
    await svc.harvest({ targetUrl: "https://example.com/page" });

    expect(httpEngine.fetch).toHaveBeenCalledWith("https://example.com/page");
    expect(browser.launch).not.toHaveBeenCalled();
    expect(storage.save).toHaveBeenCalled();
  });

  it("falls back to browser when HTTP engine returns null", async () => {
    const httpEngine: ILightHttpEngine = { fetch: jest.fn().mockResolvedValue(null) };

    const svc = new HarvesterService(logger, browser, storage, httpEngine);
    await svc.harvest({ targetUrl: "https://example.com/spa" });

    expect(httpEngine.fetch).toHaveBeenCalled();
    expect(browser.launch).toHaveBeenCalled();
    expect(storage.save).toHaveBeenCalled();
  });

  it("crawler error falls through to HTTP engine", async () => {
    const dispatcher = new CrawlerDispatcher();
    const failingCrawler: ISiteCrawler = {
      ...stubCrawler("fail", "example.com", true),
      fetch: jest.fn().mockRejectedValue(new Error("crawler error")),
    };
    dispatcher.register(failingCrawler);

    const httpEngine = stubHttpEngine();
    const svc = new HarvesterService(logger, browser, storage, httpEngine, dispatcher);
    await svc.harvest({ targetUrl: "https://example.com/page" });

    expect(httpEngine.fetch).toHaveBeenCalled();
    expect(storage.save).toHaveBeenCalled();
  });

  it("all engines fail → falls back to browser", async () => {
    const dispatcher = new CrawlerDispatcher();
    dispatcher.register(stubCrawler("nomatch", "other.com", false));
    const httpEngine: ILightHttpEngine = { fetch: jest.fn().mockRejectedValue(new Error("HTTP engine failed")) };

    const svc = new HarvesterService(logger, browser, storage, httpEngine, dispatcher);
    await svc.harvest({ targetUrl: "https://example.com/page" });
    expect(browser.launch).toHaveBeenCalled();
    expect(storage.save).toHaveBeenCalled();
  });

  it("saves result with correct targetUrl", async () => {
    const dispatcher = new CrawlerDispatcher();
    dispatcher.register(stubCrawler("test", "example.com", true));

    const svc = new HarvesterService(logger, browser, storage, undefined, dispatcher);
    const result = await svc.harvest({ targetUrl: "https://example.com/test" });

    expect(result.targetUrl).toBe("https://example.com/test");
    expect(result.traceId).toBeTruthy();
    expect(result.startedAt).toBeLessThan(result.finishedAt);
  });

  it("browser.close called after harvest completes", async () => {
    const dispatcher = new CrawlerDispatcher();
    dispatcher.register(stubCrawler("test", "example.com", true));

    const svc = new HarvesterService(logger, browser, storage, undefined, dispatcher);
    await svc.harvest({ targetUrl: "https://example.com/page" });

    expect(browser.close).toHaveBeenCalled();
  });

  it("returns result with expected structure", async () => {
    const dispatcher = new CrawlerDispatcher();
    dispatcher.register(stubCrawler("test", "example.com", true));

    const svc = new HarvesterService(logger, browser, storage, undefined, dispatcher);
    const result = await svc.harvest({ targetUrl: "https://example.com/page" });

    expect(result).toHaveProperty("networkRequests");
    expect(result).toHaveProperty("analysis");
    expect(result.analysis).toHaveProperty("apiRequests");
    expect(result.analysis).toHaveProperty("hiddenFields");
  });
});
