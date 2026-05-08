import http from "http";
import os from "os";
import { Router } from "../Router";
import { ServerContext } from "./context";
import { loadAppConfig } from "../../utils/config-loader";
import { FeatureFlags, DEFAULT_FEATURE_FLAGS } from "../../core/features";
import pkg from "../../../package.json";

export function registerSystemRoutes(router: Router, ctx: ServerContext): void {
  router.register("*", "/health", (req, res) => handleHealth(res, ctx));
  router.register("*", "/api/health", (req, res) => handleHealth(res, ctx));
  router.register("GET", "/api/crawlers", (req, res) => handleApiCrawlers(res));
  router.register("GET", "/api/features", (req, res) => handleApiFeatures(res));
}

async function handleHealth(res: http.ServerResponse, ctx: ServerContext): Promise<void> {
  const profileCount = await ctx.sessionManager.listProfiles().then(p => p.length).catch(() => 0);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    status: "ok",
    uptime: process.uptime(),
    version: (pkg as { version: string }).version || "1.0.0",
    platform: os.platform(),
    memoryUsage: process.memoryUsage(),
    profileCount,
    taskQueueLength: ctx.getTaskQueue()?.getStatus().pending ?? 0,
    activeBrowsers: 0,
  }));
}

async function handleApiCrawlers(res: http.ServerResponse): Promise<void> {
  const appCfg = await loadAppConfig();
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ code: 0, data: appCfg.crawlers ?? {} }));
}

async function handleApiFeatures(res: http.ServerResponse): Promise<void> {
  const unimplemented = ["enableParallelTask", "enableBrowserPool", "enableDaemonProcess"];
  const flags: Record<string, { enabled: boolean; implemented: boolean }> = {};
  for (const key of Object.keys(DEFAULT_FEATURE_FLAGS)) {
    flags[key] = {
      enabled: FeatureFlags[key] ?? false,
      implemented: !unimplemented.includes(key),
    };
  }
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ code: 0, data: flags }));
}
