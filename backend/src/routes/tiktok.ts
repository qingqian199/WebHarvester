import { Router, Request, Response } from "express";

export function createTikTokRouter(): Router {
  const router = Router();

  router.post("/sign", (_req: Request, res: Response) => {
    res.status(501).json({ error: "Not Implemented", message: "TikTok 签名服务待实现" });
  });

  return router;
}
