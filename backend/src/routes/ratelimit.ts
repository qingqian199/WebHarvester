import { Router, Request, Response } from "express";
import { RateLimitService } from "../services/RateLimitService";

export function createRateLimitRouter(rateLimitService: RateLimitService): Router {
  const router = Router();

  router.get("/status", (_req: Request, res: Response) => {
    const status = rateLimitService.getStatus();
    res.json(status);
  });

  router.post("/acquire", (_req: Request, res: Response) => {
    res.json({ ok: true, message: "限流由主进程管理，后端仅提供状态查询" });
  });

  return router;
}
