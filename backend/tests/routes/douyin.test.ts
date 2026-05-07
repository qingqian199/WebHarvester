import request from "supertest";
import express from "express";
import { createDouyinRouter } from "../../src/routes/douyin";

jest.mock("../../src/services/DouyinSignService", () => ({
  DouyinSignService: jest.fn().mockImplementation(() => ({
    isReady: true,
    getCachedEndpoints: jest.fn().mockReturnValue(["test_endpoint"]),
    getSeenEndpoints: jest.fn().mockReturnValue([]),
    getSignature: jest.fn().mockReturnValue({ x_bogus: "test_sig", msToken: "test_token" }),
  })),
}));

import { DouyinSignService } from "../../src/services/DouyinSignService";

describe("Douyin API Routes", () => {
  let app: express.Express;
  const mockConfig = {
    port: 3001, host: "0.0.0.0", stokenRefreshMs: 60000,
    bootstrapUrl: "", headless: true,
    xhsSignEnabled: false, tiktokSignEnabled: false, douyinSignEnabled: true,
  };

  beforeEach(() => {
    const svc = new DouyinSignService(mockConfig as any);
    app = express();
    app.use(express.json());
    app.use("/api/douyin", createDouyinRouter(svc));
  });

  describe("GET /api/douyin/health", () => {
    it("returns service status", async () => {
      const res = await request(app).get("/api/douyin/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ready");
      expect(res.body.cachedSignatures).toBeGreaterThanOrEqual(0);
    });
  });

  describe("GET /api/douyin/sign", () => {
    it("returns 400 when endpoint missing", async () => {
      const res = await request(app).get("/api/douyin/sign");
      expect(res.status).toBe(400);
    });

    it("returns signature for known endpoint", async () => {
      const res = await request(app).get("/api/douyin/sign?endpoint=test_endpoint");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("signature");
    });
  });
});
