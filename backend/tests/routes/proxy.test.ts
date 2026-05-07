import request from "supertest";
import express from "express";
import { ProxyPoolService } from "../../src/services/ProxyPoolService";
import { createProxyRouter } from "../../src/routes/proxy";

describe("Proxy API Routes", () => {
  let app: express.Express;
  let proxyService: ProxyPoolService;

  beforeEach(() => {
    proxyService = new ProxyPoolService();
    app = express();
    app.use(express.json());
    app.use("/api/proxy", createProxyRouter(proxyService));
  });

  describe("GET /api/proxy/status", () => {
    it("returns unconfigured status when no proxy pool is set", async () => {
      const res = await request(app).get("/api/proxy/status");
      expect(res.status).toBe(200);
      expect(res.body.enabled).toBe(false);
      expect(res.body.configured).toBe(false);
      expect(res.body).toHaveProperty("reason", "代理池未配置");
    });

    it("returns configured status after updateStatus is called", async () => {
      proxyService.updateStatus({ enabled: true, total: 10, available: 8, mode: "manual" });
      const res = await request(app).get("/api/proxy/status");
      expect(res.status).toBe(200);
      expect(res.body.enabled).toBe(true);
      expect(res.body.totalProxies).toBe(10);
      expect(res.body.availableProxies).toBe(8);
      expect(res.body.configured).toBe(true);
    });
  });

  describe("POST /api/proxy/healthcheck", () => {
    it("returns health check results", async () => {
      proxyService.updateStatus({ enabled: true, total: 5, available: 3, mode: "tunnel" });
      const res = await request(app).post("/api/proxy/healthcheck");
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body).toHaveProperty("checked", 5);
      expect(res.body).toHaveProperty("available", 3);
    });
  });
});
