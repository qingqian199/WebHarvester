import request from "supertest";
import express from "express";
import { createTikTokRouter } from "../../src/routes/tiktok";

describe("TikTok API Routes", () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use("/api/tiktok", createTikTokRouter(null));
  });

  describe("GET /api/tiktok/health", () => {
    it("returns disabled status when no service", async () => {
      const res = await request(app).get("/api/tiktok/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("disabled");
    });
  });

  describe("POST /api/tiktok/sign", () => {
    it("returns 501 when no service configured", async () => {
      const res = await request(app).post("/api/tiktok/sign").send({ url: "https://www.tiktok.com/" });
      expect(res.status).toBe(501);
    });
  });
});
