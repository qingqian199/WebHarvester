import { ZpTokenService } from "../src/services/ZpTokenService";

jest.mock("playwright", () => ({
  chromium: {
    launch: jest.fn().mockResolvedValue({
      newContext: jest.fn().mockResolvedValue({
        newPage: jest.fn().mockResolvedValue({
          addInitScript: jest.fn().mockResolvedValue(undefined),
          on: jest.fn(),
          goto: jest.fn().mockResolvedValue(undefined),
          waitForSelector: jest.fn().mockResolvedValue(undefined),
          waitForTimeout: jest.fn().mockResolvedValue(undefined),
          evaluate: jest.fn().mockResolvedValue(undefined),
          close: jest.fn().mockResolvedValue(undefined),
        }),
        cookies: jest.fn().mockResolvedValue([
          { name: "__zp_stoken__", value: "test_stoken_value", domain: ".zhipin.com", path: "/" },
          { name: "__zp_sseed__", value: "12345", domain: ".zhipin.com", path: "/" },
          { name: "ab_guid", value: "abc", domain: ".zhipin.com", path: "/" },
        ]),
        close: jest.fn().mockResolvedValue(undefined),
      }),
      close: jest.fn().mockResolvedValue(undefined),
    }),
  },
}));

describe("ZpTokenService", () => {
  const mockConfig = {
    port: 3001,
    host: "0.0.0.0",
    stokenRefreshMs: 60000,
    bootstrapUrl: "https://www.zhipin.com/web/geek/jobs",
    headless: true,
    douyinSignEnabled: false,
  };

  let service: ZpTokenService;

  beforeEach(() => {
    service = new ZpTokenService(mockConfig);
  });

  afterEach(async () => {
    await service.stop();
  });

  describe("initial state", () => {
    it("starts as not ready", () => {
      expect(service.isReady).toBe(false);
      expect(service.started).toBe(false);
    });

    it("has empty token values", () => {
      expect(service.stoken).toBe("");
      expect(service.traceid).toBe("");
      expect(service.cookies).toEqual({});
    });
  });

  describe("start()", () => {
    it("starts and becomes ready", async () => {
      await service.start();
      expect(service.started).toBe(true);
      expect(service.isReady).toBe(true);
    });

    it("extracts stoken from cookies", async () => {
      await service.start();
      expect(service.stoken).toBe("test_stoken_value");
    });

    it("extracts cookies map", async () => {
      await service.start();
      expect(service.cookies).toHaveProperty("__zp_stoken__");
      expect(service.cookies["__zp_stoken__"]).toBe("test_stoken_value");
    });

    it("is idempotent", async () => {
      await service.start();
      await service.start();
      expect(service.isReady).toBe(true);
    });
  });

  describe("forceRefresh()", () => {
    it("refreshes stoken", async () => {
      await service.start();
      await service.forceRefresh();
      expect(service.stoken).toBe("test_stoken_value");
    });
  });

  describe("waitReady()", () => {
    it("returns immediately if already ready", async () => {
      await service.start();
      await expect(service.waitReady(100)).resolves.toBeUndefined();
    });

    it("times out without blocking indefinitely", async () => {
      const start = Date.now();
      await service.waitReady(50);
      expect(Date.now() - start).toBeLessThan(500);
    });
  });

  describe("stop()", () => {
    it("cleans up and resets state", async () => {
      await service.start();
      await service.stop();
      expect(service.isReady).toBe(false);
      expect(service.started).toBe(false);
    });

    it("is safe to call multiple times", async () => {
      await service.stop();
      await service.stop();
    });
  });
});
