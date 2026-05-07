import { Router } from "express";
import { DouyinSignService } from "../services/DouyinSignService";

export function createDouyinRouter(svc: DouyinSignService): Router {
  const router = Router();

  router.get("/health", (_req, res) => {
    const ready = svc.isReady;
    const cached = svc.getCachedEndpoints();
    const seen = svc.getSeenEndpoints();
    res.json({
      status: ready ? "ready" : "starting",
      cachedSignatures: cached.length,
      cached: cached.slice(0, 30),
      seenEndpoints: seen.length,
      recent: seen.slice(-20),
    });
  });

  router.get("/sign", (req, res) => {
    if (!svc.isReady) {
      res.status(503).json({ error: "service not ready", status: "starting" });
      return;
    }
    const endpoint = req.query.endpoint as string;
    if (!endpoint) {
      res.status(400).json({ error: "missing endpoint query param" });
      return;
    }
    const signature = svc.getSignature(endpoint);
    if (!signature) {
      res.status(404).json({ error: "signature not found for endpoint", endpoint, cachedEndpoints: svc.getCachedEndpoints() });
      return;
    }
    res.json({ endpoint, signature });
  });

  return router;
}
