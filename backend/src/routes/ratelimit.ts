import { Router, Request, Response } from "express";
import { RateLimitService } from "../services/RateLimitService";

export function createRateLimitRouter(_rateLimitService: RateLimitService): Router {
  const router = Router();

  router.post("/acquire", (_req: Request, res: Response) => {
    res.status(501).json({ error: "Not Implemented", message: "限流令牌服务待实现" });
  });

  return router;
}
