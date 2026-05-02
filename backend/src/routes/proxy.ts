import { Router, Request, Response } from "express";
import { ProxyPoolService } from "../services/ProxyPoolService";

export function createProxyRouter(_proxyService: ProxyPoolService): Router {
  const router = Router();

  router.get("/:site", (_req: Request, res: Response) => {
    res.status(501).json({ error: "Not Implemented", message: "代理池服务待实现" });
  });

  return router;
}
