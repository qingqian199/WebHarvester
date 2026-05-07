/* eslint-disable no-var */

import { BossTokenService, BossSession } from "../BossSessionProvider";

// 这些 mock 函数在 jest.mock 工厂内创建并赋值，提供给测试访问
var mockLaunch: jest.Mock;
var mockNewContext: jest.Mock;
var mockNewPage: jest.Mock;
var mockOn: jest.Mock;
var mockAddInitScript: jest.Mock;
var mockGoto: jest.Mock;
var mockWaitForSelector: jest.Mock;
var mockWaitForTimeout: jest.Mock;
var mockCookies: jest.Mock;
var mockEvaluate: jest.Mock;
var mockBrowserClose: jest.Mock;
var mockContextClose: jest.Mock;

jest.mock("playwright", () => {
  mockLaunch = jest.fn();
  mockNewContext = jest.fn();
  mockNewPage = jest.fn();
  mockOn = jest.fn();
  mockAddInitScript = jest.fn();
  mockGoto = jest.fn();
  mockWaitForSelector = jest.fn();
  mockWaitForTimeout = jest.fn();
  mockCookies = jest.fn();
  mockEvaluate = jest.fn();
  mockBrowserClose = jest.fn();
  mockContextClose = jest.fn();

  const mockPage = { on: mockOn, addInitScript: mockAddInitScript, goto: mockGoto, waitForSelector: mockWaitForSelector, waitForTimeout: mockWaitForTimeout, evaluate: mockEvaluate, context: jest.fn() };
  const mockContext = { newPage: mockNewPage, cookies: mockCookies, close: mockContextClose };
  const mockBrowser = { newContext: mockNewContext, close: mockBrowserClose };
  mockNewContext.mockReturnValue(mockContext);
  mockNewPage.mockResolvedValue(mockPage);
  mockLaunch.mockResolvedValue(mockBrowser);

  return { chromium: { launch: mockLaunch } };
});

jest.mock("../../ConsoleLogger", () => ({
  ConsoleLogger: jest.fn().mockImplementation(() => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
  })),
}));

function buildMockChain() {
  const page = { on: mockOn, addInitScript: mockAddInitScript, goto: mockGoto, waitForSelector: mockWaitForSelector, waitForTimeout: mockWaitForTimeout, evaluate: mockEvaluate, context: jest.fn() };
  const ctx = { newPage: mockNewPage, cookies: mockCookies, close: mockContextClose };
  const browser = { newContext: mockNewContext, close: mockBrowserClose };
  mockNewContext.mockReturnValue(ctx);
  mockNewPage.mockResolvedValue(page);
  mockLaunch.mockResolvedValue(browser);
  return { page, ctx, browser };
}

beforeEach(() => {
  jest.clearAllMocks();
  buildMockChain();
  mockGoto.mockResolvedValue(undefined);
  mockWaitForSelector.mockResolvedValue(undefined);
  mockWaitForTimeout.mockResolvedValue(undefined);
  mockCookies.mockResolvedValue([]);
  mockEvaluate.mockResolvedValue(undefined);
  mockBrowserClose.mockResolvedValue(undefined);
  jest.useFakeTimers({ doNotFake: ["performance", "nextTick"] });
});

afterEach(() => {
  jest.useRealTimers();
});

describe("BossTokenService", () => {
  describe("start() - bootstrap session", () => {
    it("launches browser, creates context/page, navigates to BOSS", async () => {
      mockCookies.mockResolvedValue([{ name: "c", value: "v" }]);
      const service = new BossTokenService();
      await service.start();
      expect(mockNewContext).toHaveBeenCalledWith(expect.objectContaining({ locale: "zh-CN" }));
      expect(mockNewPage).toHaveBeenCalledTimes(1);
      expect(mockGoto).toHaveBeenCalledWith(
        "https://www.zhipin.com/web/geek/jobs",
        expect.objectContaining({ waitUntil: "domcontentloaded" }),
      );
      expect(mockWaitForSelector).toHaveBeenCalledWith("#app", expect.any(Object));
    });

    it("injects anti-detection init script", async () => {
      mockCookies.mockResolvedValue([{ name: "c", value: "v" }]);
      const service = new BossTokenService();
      await service.start();
      expect(mockAddInitScript).toHaveBeenCalledTimes(1);
    });

    it("handles waitForSelector timeout gracefully", async () => {
      mockWaitForSelector.mockRejectedValue(new Error("timeout"));
      mockCookies.mockResolvedValue([{ name: "c", value: "v" }]);
      const service = new BossTokenService();
      await expect(service.start()).resolves.not.toThrow();
    });

    it("captures __zp_stoken__ from cookies after page load", async () => {
      mockCookies.mockResolvedValue([
        { name: "other", value: "x" },
        { name: "__zp_stoken__", value: "stoken_mock_val" },
      ]);
      const service = new BossTokenService();
      await service.start();
      expect(service.getZpStoken()).toBe("stoken_mock_val");
    });

    it("captures traceid from request events", async () => {
      mockCookies.mockResolvedValue([{ name: "c", value: "v" }]);
      const service = new BossTokenService();
      await service.start();
      const handler = mockOn.mock.calls.find((c) => c[0] === "request")?.[1];
      expect(handler).toBeDefined();
      handler({ headers: () => ({ traceid: "TRACE_captured" }) });
      expect(service.getTraceId()).toBe("TRACE_captured");
    });

    it("filters default F-000000 prefix traceid", async () => {
      mockCookies.mockResolvedValue([{ name: "c", value: "v" }]);
      const service = new BossTokenService();
      await service.start();
      const handler = mockOn.mock.calls.find((c) => c[0] === "request")?.[1];
      handler({ headers: () => ({ traceid: "F-000000000000000" }) });
      expect(service.getTraceId()).toBe("");
    });

    it("sets up periodic refresh interval", async () => {
      mockCookies.mockResolvedValue([{ name: "__zp_stoken__", value: "initial" }]);
      const service = new BossTokenService();
      await service.start();
      expect(service.getZpStoken()).toBe("initial");
      mockCookies.mockResolvedValue([{ name: "__zp_stoken__", value: "refreshed" }]);
      jest.advanceTimersByTime(30 * 60 * 1000 + 100);
      await Promise.resolve();
      expect(service.getZpStoken()).toBe("refreshed");
    });

    it("returns early if already started", async () => {
      mockCookies.mockResolvedValue([{ name: "c", value: "v" }]);
      const service = new BossTokenService();
      await service.start();
      mockGoto.mockClear();
      await service.start();
      expect(mockGoto).not.toHaveBeenCalled();
    });

    it("registers process exit handlers", async () => {
      const onSpy = jest.spyOn(process, "on");
      mockCookies.mockResolvedValue([{ name: "c", value: "v" }]);
      const service = new BossTokenService();
      await service.start();
      expect(onSpy).toHaveBeenCalledWith("exit", expect.any(Function));
      expect(onSpy).toHaveBeenCalledWith("SIGINT", expect.any(Function));
      expect(onSpy).toHaveBeenCalledWith("SIGTERM", expect.any(Function));
      onSpy.mockRestore();
    });
  });

  describe("refreshZpStokenFromBrowser", () => {
    it("extracts __zp_stoken__ cookie", async () => {
      mockCookies.mockResolvedValue([{ name: "__zp_stoken__", value: "stoken_extracted" }]);
      const service = new BossTokenService();
      await service.start();
      expect(service.getZpStoken()).toBe("stoken_extracted");
    });

    it("returns empty when no __zp_stoken__ cookie", async () => {
      mockCookies.mockResolvedValue([{ name: "other", value: "v" }]);
      const service = new BossTokenService();
      await service.start();
      expect(service.getZpStoken()).toBe("");
    });

    it("returns empty when page is null", async () => {
      const service = new BossTokenService();
      const result = await (service as any).refreshZpStokenFromBrowser();
      expect(result).toBe("");
    });
  });

  describe("getZpStoken / getTraceId", () => {
    it("getZpStoken returns cached value", async () => {
      mockCookies.mockResolvedValue([{ name: "__zp_stoken__", value: "cached" }]);
      const service = new BossTokenService();
      await service.start();
      expect(service.getZpStoken()).toBe("cached");
    });

    it("getTraceId returns empty before request event", async () => {
      mockCookies.mockResolvedValue([{ name: "c", value: "v" }]);
      const service = new BossTokenService();
      await service.start();
      expect(service.getTraceId()).toBe("");
    });

    it("getTraceId returns captured traceid", async () => {
      mockCookies.mockResolvedValue([{ name: "c", value: "v" }]);
      const service = new BossTokenService();
      await service.start();
      const handler = mockOn.mock.calls.find((c) => c[0] === "request")?.[1];
      handler({ headers: () => ({ traceid: "TRACE_123" }) });
      expect(service.getTraceId()).toBe("TRACE_123");
    });
  });

  describe("refreshZpStoken", () => {
    it("calls evaluate and waits 2s", async () => {
      mockCookies.mockResolvedValue([{ name: "__zp_stoken__", value: "s" }]);
      const service = new BossTokenService();
      await service.start();
      await service.refreshZpStoken();
      expect(mockEvaluate).toHaveBeenCalled();
      expect(mockWaitForTimeout).toHaveBeenCalledWith(2000);
    });

    it("does not throw when page is null", async () => {
      const service = new BossTokenService();
      await expect(service.refreshZpStoken()).resolves.not.toThrow();
    });
  });

  describe("stop", () => {
    it("closes browser and clears state", async () => {
      mockCookies.mockResolvedValue([{ name: "c", value: "v" }]);
      const service = new BossTokenService();
      await service.start();
      expect((service as any).started).toBe(true);
      await service.stop();
      expect(mockBrowserClose).toHaveBeenCalledTimes(1);
      expect((service as any).started).toBe(false);
    });

    it("clears refresh timer", async () => {
      mockCookies.mockResolvedValue([{ name: "c", value: "v" }]);
      const service = new BossTokenService();
      await service.start();
      await service.stop();
      expect((service as any).refreshTimer).toBeNull();
    });

    it("is safe to call when not started", async () => {
      const service = new BossTokenService();
      await expect(service.stop()).resolves.not.toThrow();
    });

    it("is safe to call multiple times", async () => {
      mockCookies.mockResolvedValue([{ name: "c", value: "v" }]);
      const service = new BossTokenService();
      await service.start();
      await service.stop();
      mockBrowserClose.mockClear();
      await service.stop();
      expect(mockBrowserClose).not.toHaveBeenCalled();
    });
  });

  describe("types", () => {
    it("BossSession has cookies and traceid", () => {
      const s: BossSession = { cookies: { k: "v" }, traceid: "t" };
      expect(s.cookies.k).toBe("v");
      expect(s.traceid).toBe("t");
    });
  });
});
