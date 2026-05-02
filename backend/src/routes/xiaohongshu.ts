import { Router, Request, Response } from "express";

export function createXiaohongshuRouter(): Router {
  const router = Router();

  router.post("/sign", (_req: Request, res: Response) => {
    res.status(501).json({ error: "Not Implemented", message: "小红书签名注入服务待实现" });
  });

  return router;
}
