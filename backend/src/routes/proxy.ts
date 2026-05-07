import { Router, Request, Response } from "express";
import { ProxyPoolService } from "../services/ProxyPoolService";

export function createProxyRouter(proxyService: ProxyPoolService): Router {
  const router = Router();

  router.get("/status", (_req: Request, res: Response) => {
    const status = proxyService.getStatus();
    if (!status.configured) {
      res.json({ enabled: false, configured: false, reason: "代理池未配置" });
      return;
    }
    res.json(status);
  });

  router.post("/healthcheck", async (_req: Request, res: Response) => {
    try {
      const result = await proxyService.runHealthCheck();
      res.json({ ok: true, ...result });
    } catch (err: unknown) {
      res.status(500).json({ ok: false, error: (err as Error).message });
    }
  });

  router.get("/:site", (_req: Request, res: Response) => {
    res.status(404).json({ error: "直接获取代理已废弃，请使用 /status 和 /healthcheck" });
  });

  return router;
}
