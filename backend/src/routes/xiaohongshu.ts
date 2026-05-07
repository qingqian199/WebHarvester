import { Router, Request, Response } from "express";
import { XhsSignService } from "../services/XhsSignService";

export function createXiaohongshuRouter(xhsService: XhsSignService | null = null): Router {
  const router = Router();

  router.get("/health", async (_req: Request, res: Response) => {
    if (!xhsService) { res.json({ status: "disabled", ready: false, note: "X-s 签名由本地 xhs-signer.ts 纯 JS 计算，无需后端服务" }); return; }
    res.json({ status: xhsService.isReady ? "ready" : "starting", ready: xhsService.isReady });
  });

  router.post("/sign", async (req: Request, res: Response) => {
    if (!xhsService) {
      res.json({ signature: "placeholder", status: "not_implemented", message: "XHS sign service is a pure JS module in xhs-signer.ts, no backend required" });
      return;
    }
    const { apiPath, data, cookies, userAgent, platform } = req.body;
    if (!apiPath) {
      res.status(400).json({ error: "缺少 apiPath" });
      return;
    }
    try {
      const result = await xhsService.sign({ apiPath, data: data || "", cookies, userAgent, platform });
      res.json(result);
    } catch (err: unknown) {
      res.status(500).json({ error: "签名失败", message: (err as Error).message });
    }
  });

  return router;
}
