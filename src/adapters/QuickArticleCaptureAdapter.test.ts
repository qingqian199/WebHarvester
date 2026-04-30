import { QuickArticleCaptureAdapter } from "./QuickArticleCaptureAdapter";
import { IBrowserAdapter } from "../core/ports/IBrowserAdapter";
import { ILogger } from "../core/ports/ILogger";

function stubBrowser(): jest.Mocked<IBrowserAdapter> {
  return {
    launch: jest.fn().mockResolvedValue(undefined),
    performActions: jest.fn(),
    captureNetworkRequests: jest.fn() as any,
    queryElements: jest.fn() as any,
    getStorage: jest.fn() as any,
    executeScript: jest.fn().mockImplementation(<T>(script: string) => {
      if (script.includes("document.title")) return Promise.resolve("测试文章标题" as T);
      if (script.includes("querySelector")) return Promise.resolve("测试正文内容" as T);
      if (script.includes("meta[name=\"author\"]")) return Promise.resolve("测试作者" as T);
      if (script.includes(".AuthorInfo-name")) return Promise.resolve("" as T);
      return Promise.resolve("" as T);
    }),
    getPageMetrics: jest.fn().mockReturnValue(null),
    close: jest.fn().mockResolvedValue(undefined),
  };
}

function stubLogger(): ILogger {
  return { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

describe("QuickArticleCaptureAdapter", () => {
  let browser: jest.Mocked<IBrowserAdapter>;
  let logger: ILogger;

  beforeEach(() => {
    browser = stubBrowser();
    logger = stubLogger();
  });

  it("extracts title, content, and author from page", async () => {
    const adapter = new QuickArticleCaptureAdapter(browser, logger);
    const result = await adapter.capture("https://zhuanlan.zhihu.com/p/test");

    expect(result.title).toBe("测试文章标题");
    expect(result.content).toBe("测试正文内容");
    expect(result.contentHtml).toBe("测试正文内容");
    expect(result.capturedAt).toBeTruthy();
    expect(browser.launch).toHaveBeenCalledWith("https://zhuanlan.zhihu.com/p/test", undefined);
    expect(browser.close).toHaveBeenCalledTimes(1);
  });

  it("uses default content selector when no platform match", async () => {
    const adapter = new QuickArticleCaptureAdapter(browser, logger);
    await adapter.capture("https://unknown-blog.com/post/1");

    const launchCall = browser.executeScript.mock.calls.find(c => (c[0] as string).includes("querySelector"));
    expect(launchCall).toBeDefined();
  });

  it("falls back to meta author when platform author selector returns empty", async () => {
    const adapter = new QuickArticleCaptureAdapter(browser, logger);
    const result = await adapter.capture("https://zhuanlan.zhihu.com/p/test");
    expect(result.author.name).toBe("测试正文内容");
  });

  it("returns 未知作者 when no author found at all", async () => {
    browser.executeScript = jest.fn().mockResolvedValue("");
    const adapter = new QuickArticleCaptureAdapter(browser, logger);
    const result = await adapter.capture("https://example.com/article");
    expect(result.author.name).toBe("未知作者");
  });

  it("detects zhihu.com platform and uses .RichText selector", async () => {
    const adapter = new QuickArticleCaptureAdapter(browser, logger);
    await adapter.capture("https://www.zhihu.com/question/123");

    const executeCalls = browser.executeScript.mock.calls.map(c => c[0] as string);
    const hasRichText = executeCalls.some(s => s.includes(".RichText"));
    expect(hasRichText).toBe(true);
  });

  it("accepts custom content selector", async () => {
    const adapter = new QuickArticleCaptureAdapter(browser, logger);
    await adapter.capture("https://example.com/article", { contentSelector: ".article-body" });

    const executeCalls = browser.executeScript.mock.calls.map(c => c[0] as string);
    const hasCustom = executeCalls.some(s => s.includes(".article-body"));
    expect(hasCustom).toBe(true);
  });

  it("includes performance when available", async () => {
    browser.getPageMetrics = jest.fn().mockReturnValue({
      navigationStart: 0,
      domContentLoadedEventEnd: 100,
      loadEventEnd: 200,
      domInteractive: 50,
      duration: 200,
      transferSize: 1000,
      encodedBodySize: 800,
      decodedBodySize: 2000,
      protocol: "h2",
      type: "navigate",
    });

    const adapter = new QuickArticleCaptureAdapter(browser, logger);
    const result = await adapter.capture("https://example.com/article");
    expect(result.performance).toBeDefined();
    expect(result.performance!.duration).toBe(200);
  });

  it("calls close even after executeScript failure", async () => {
    browser.executeScript = jest.fn().mockRejectedValue(new Error("fail"));
    const adapter = new QuickArticleCaptureAdapter(browser, logger);

    await expect(adapter.capture("https://example.com/article")).rejects.toThrow("fail");
    expect(browser.close).toHaveBeenCalledWith();
  });
});
