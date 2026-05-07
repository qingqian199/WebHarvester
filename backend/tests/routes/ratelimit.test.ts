import request from "supertest";
import express from "express";
import { RateLimitService } from "../../src/services/RateLimitService";
import { createRateLimitRouter } from "../../src/routes/ratelimit";

describe("RateLimit API Routes", () => {
  let app: express.Express;
  let rateLimitService: RateLimitService;

  beforeEach(() => {
    rateLimitService = new RateLimitService();
    app = express();
    app.use(express.json());
    app.use("/api/ratelimit", createRateLimitRouter(rateLimitService));
  });

  describe("GET /api/ratelimit/status", () => {
    it("returns empty sites when no data synced", async () => {
      const res = await request(app).get("/api/ratelimit/status");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("sites");
      expect(Object.keys(res.body.sites)).toHaveLength(0);
    });

    it("returns site status after updateStatus is called", async () => {
      rateLimitService.updateStatus({
        xiaohongshu: { successRate: 0.85, isPaused: false, backoffLevel: 1 },
      });
      const res = await request(app).get("/api/ratelimit/status");
      expect(res.status).toBe(200);
      expect(res.body.sites.xiaohongshu.successRate).toBe(0.85);
      expect(res.body.sites.xiaohongshu.isPaused).toBe(false);
    });
  });

  describe("POST /api/ratelimit/acquire", () => {
    it("returns placeholder response", async () => {
      const res = await request(app).post("/api/ratelimit/acquire");
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });
});
