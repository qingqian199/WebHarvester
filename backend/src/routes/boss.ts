import { Router, Request, Response } from "express";
import { ZpTokenService } from "../services/ZpTokenService";

export function createBossRouter(tokenService: ZpTokenService): Router {
  const router = Router();

  router.get("/health", async (_req: Request, res: Response) => {
    const ready = tokenService.isReady;
    res.json({
      status: ready ? "ready" : "starting",
      ready,
      hasStoken: !!tokenService.stoken,
      hasTraceid: !!tokenService.traceid,
    });
  });

  router.get("/token", async (_req: Request, res: Response) => {
    if (!tokenService.isReady) {
      await tokenService.waitReady(60000);
    }
    res.json({
      stoken: tokenService.stoken,
      traceid: tokenService.traceid,
      cookies: tokenService.cookies,
    });
  });

  router.post("/token/refresh", async (_req: Request, res: Response) => {
    if (!tokenService.isReady) {
      res.status(503).json({ error: "令牌服务未就绪" });
      return;
    }
    await tokenService.forceRefresh();
    res.json({
      stoken: tokenService.stoken,
      traceid: tokenService.traceid,
      cookies: tokenService.cookies,
    });
  });

  return router;
}
