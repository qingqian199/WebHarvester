import { HarvesterService } from "./HarvesterService";
import { ILogger } from "../ports/ILogger";
import { IBrowserAdapter } from "../ports/IBrowserAdapter";
import { IStorageAdapter } from "../ports/IStorageAdapter";
import { ISessionManager } from "../ports/ISessionManager";
import { HarvestConfig, NetworkRequest, ElementItem, StorageSnapshot } from "../models";
import { BizError } from "../error/BizError";

function stubLogger(): ILogger {
  const logger: ILogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    setTraceId: jest.fn(),
  };
  return logger;
}

function stubBrowser(): IBrowserAdapter {
  return {
    launch: jest.fn() as any,
    performActions: jest.fn() as any,
    captureNetworkRequests: jest.fn().mockResolvedValue([] as NetworkRequest[]),
    queryElements: jest.fn().mockResolvedValue([] as ElementItem[]),
    getStorage: jest.fn().mockResolvedValue({
      localStorage: {},
      sessionStorage: {},
      cookies: [],
    } as StorageSnapshot),
    executeScript: jest.fn() as any,
    getPageMetrics: jest.fn().mockReturnValue(null),
    getPageDiagnostics: jest.fn().mockReturnValue({ consoleMessages: [], pageErrors: [] }),
    close: jest.fn() as any,
  };
}

function stubStorage(): IStorageAdapter {
  return { save: jest.fn() as any };
}

function stubSessionManager(): ISessionManager {
  return {
    save: jest.fn() as any,
    load: jest.fn() as any,
    listProfiles: jest.fn() as any,
    deleteProfile: jest.fn() as any,
  };
}

const MIN_CONFIG: HarvestConfig = { targetUrl: "https://example.com" };

describe("HarvesterService", () => {
  let logger: ReturnType<typeof stubLogger>;
  let browser: ReturnType<typeof stubBrowser>;
  let storage: ReturnType<typeof stubStorage>;
  let svc: HarvesterService;

  beforeEach(() => {
    logger = stubLogger() as any;
    browser = stubBrowser();
    storage = stubStorage();
    svc = new HarvesterService(logger, browser, storage);
  });

  describe("harvest", () => {
    it("returns a HarvestResult with traceId and targetUrl", async () => {
      const result = await svc.harvest(MIN_CONFIG);
      expect(result.traceId).toBeTruthy();
      expect(result.targetUrl).toBe("https://example.com");
      expect(result.finishedAt).toBeGreaterThanOrEqual(result.startedAt);
    });

    it("calls browser.launch with the target URL", async () => {
      await svc.harvest(MIN_CONFIG);
      expect(browser.launch).toHaveBeenCalledWith("https://example.com", undefined, undefined, undefined, undefined, undefined);
    });

    it("calls browser.close in finally", async () => {
      await svc.harvest(MIN_CONFIG);
      expect(browser.close).toHaveBeenCalledTimes(1);
    });

    it("passes sessionState to browser.launch when provided", async () => {
      const sessionState = {
        cookies: [{ name: "sid", value: "abc", domain: ".example.com" }],
        localStorage: {},
        sessionStorage: {},
        createdAt: 0,
        lastUsedAt: 0,
      };
      await svc.harvest(MIN_CONFIG, "all", false, undefined, undefined, sessionState);
      expect(browser.launch).toHaveBeenCalledWith("https://example.com", sessionState, undefined, undefined, undefined, undefined);
    });

    it("throws BizError for empty targetUrl", async () => {
      await expect(svc.harvest({ targetUrl: "" })).rejects.toThrow(BizError);
    });

    it("throws BizError for missing config", async () => {
      await expect(svc.harvest(null as any)).rejects.toThrow(BizError);
    });

    it("calls storage.save with the result", async () => {
      const result = await svc.harvest(MIN_CONFIG);
      expect(storage.save).toHaveBeenCalledWith(result, "all");
    });

    it("passes outputFormat to storage.save", async () => {
      const result = await svc.harvest(MIN_CONFIG, "csv");
      expect(storage.save).toHaveBeenCalledWith(result, "csv");
    });

    it("calls browser.performActions when actions provided", async () => {
      const actions = [{ type: "click" as const, selector: "#btn" }];
      await svc.harvest({ ...MIN_CONFIG, actions });
      expect(browser.performActions).toHaveBeenCalledWith(actions);
    });

    it("calls performActions with undefined when no actions in config", async () => {
      await svc.harvest(MIN_CONFIG);
      expect(browser.performActions).toHaveBeenCalledWith(undefined);
    });

    it("executes JS scripts and returns results", async () => {
      browser.executeScript = jest.fn().mockResolvedValue("result_value");
      const config: HarvestConfig = {
        targetUrl: "https://example.com",
        jsScripts: [{ alias: "myVar", script: "window.myVar" }],
      };
      const result = await svc.harvest(config);
      expect(result.jsVariables).toEqual({ myVar: "result_value" });
    });

    it("skips string-only jsScripts entries", async () => {
      const config: HarvestConfig = {
        targetUrl: "https://example.com",
        jsScripts: ["console.log('skip')"],
      };
      await svc.harvest(config);
      expect(browser.executeScript).not.toHaveBeenCalled();
    });

    it("handles JS script execution failure gracefully", async () => {
      browser.executeScript = jest.fn().mockRejectedValue(new Error("fail"));
      const config: HarvestConfig = {
        targetUrl: "https://example.com",
        jsScripts: [{ alias: "bad", script: "throw" }],
      };
      const result = await svc.harvest(config);
      expect(result.jsVariables).toEqual({});
    });

    it("saves session when needSaveSession is true", async () => {
      const sm = stubSessionManager();
      const storageSnapshot: StorageSnapshot = {
        cookies: [{ name: "c", value: "v", domain: "ex.com" }],
        localStorage: { k: "v" },
        sessionStorage: {},
      };
      browser.getStorage = jest.fn().mockResolvedValue(storageSnapshot);

      await svc.harvest(MIN_CONFIG, "all", true, sm, "my-profile");
      expect(sm.save).toHaveBeenCalledWith("my-profile", expect.objectContaining({
        cookies: storageSnapshot.cookies,
        localStorage: storageSnapshot.localStorage,
      }));
    });

    it("does not save session when needSaveSession is false", async () => {
      const sm = stubSessionManager();
      await svc.harvest(MIN_CONFIG, "all", false, sm, "my-profile");
      expect(sm.save).not.toHaveBeenCalled();
    });

    it("does not save session when sessionManager is missing", async () => {
      await svc.harvest(MIN_CONFIG, "all", true);
      expect(storage.save).toHaveBeenCalled();
    });
  });
});
