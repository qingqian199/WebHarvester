import request from "supertest";
import express from "express";
import { createXiaohongshuRouter } from "../../src/routes/xiaohongshu";

describe("Xiaohongshu API Routes", () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use("/api/xiaohongshu", createXiaohongshuRouter(null));
  });

  describe("GET /api/xiaohongshu/health", () => {
    it("returns disabled status when no service", async () => {
      const res = await request(app).get("/api/xiaohongshu/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("disabled");
    });
  });

  describe("POST /api/xiaohongshu/sign", () => {
    it("returns 501 when no service configured", async () => {
      const res = await request(app).post("/api/xiaohongshu/sign").send({ apiPath: "/api/test" });
      expect(res.status).toBe(501);
    });
  });
});
