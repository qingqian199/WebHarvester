import request from "supertest";
import express from "express";
import { ZpTokenService } from "../../src/services/ZpTokenService";
import { createBossRouter } from "../../src/routes/boss";

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
          { name: "__zp_stoken__", value: "test_stoken", domain: ".zhipin.com", path: "/" },
        ]),
        close: jest.fn().mockResolvedValue(undefined),
      }),
      close: jest.fn().mockResolvedValue(undefined),
    }),
  },
}));

describe("BOSS API Routes", () => {
  const mockConfig = {
    port: 3001,
    host: "0.0.0.0",
    stokenRefreshMs: 60000,
    bootstrapUrl: "https://www.zhipin.com/web/geek/jobs",
    headless: true,
  };

  let app: express.Express;
  let tokenService: ZpTokenService;

  beforeEach(async () => {
    tokenService = new ZpTokenService(mockConfig);
    await tokenService.start();
    app = express();
    app.use(express.json());
    app.use("/api/boss", createBossRouter(tokenService));
  });

  afterEach(async () => {
    await tokenService.stop();
  });

  describe("GET /api/boss/health", () => {
    it("returns ready status", async () => {
      const res = await request(app).get("/api/boss/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ready");
      expect(res.body.ready).toBe(true);
    });
  });

  describe("GET /api/boss/token", () => {
    it("returns stoken, traceid, and cookies", async () => {
      const res = await request(app).get("/api/boss/token");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("stoken");
      expect(res.body).toHaveProperty("traceid");
      expect(res.body).toHaveProperty("cookies");
    });
  });

  describe("POST /api/boss/token/refresh", () => {
    it("refreshes and returns token data", async () => {
      const res = await request(app).post("/api/boss/token/refresh");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("stoken");
      expect(res.body).toHaveProperty("cookies");
    });
  });
});
