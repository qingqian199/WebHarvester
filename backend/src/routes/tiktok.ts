import { Router, Request, Response } from "express";
import { TiktokSignService } from "../services/TiktokSignService";

export function createTikTokRouter(ttService: TiktokSignService | null = null): Router {
  const router = Router();

  router.get("/health", async (_req: Request, res: Response) => {
    if (!ttService) { res.json({ status: "standalone", note: "TikTok signing is handled by local Phase 1 MD5; Phase 2 WIP" }); return; }
    res.json({ status: ttService.isReady ? "ready" : "starting", ready: ttService.isReady });
  });

  router.post("/sign", async (req: Request, res: Response) => {
    if (!ttService) {
      res.json({ status: "standalone", message: "TikTok signing is handled by local Phase 1 MD5; Phase 2 WIP" });
      return;
    }
    const { url, method, body, headers, cookie } = req.body;
    if (!url) {
      res.status(400).json({ error: "缺少 url" });
      return;
    }
    try {
      const result = await ttService.sign({ url, method: method || "GET", body, headers: headers || {}, cookie });
      res.json(result);
    } catch (err: unknown) {
      res.status(500).json({ error: "签名失败", message: (err as Error).message });
    }
  });

  return router;
}
