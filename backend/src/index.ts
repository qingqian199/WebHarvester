import express from "express";
import cors from "cors";
import { loadConfig } from "./config";
import { ZpTokenService } from "./services/ZpTokenService";
import { ProxyPoolService } from "./services/ProxyPoolService";
import { RateLimitService } from "./services/RateLimitService";
import { createBossRouter } from "./routes/boss";
import { createXiaohongshuRouter } from "./routes/xiaohongshu";
import { createTikTokRouter } from "./routes/tiktok";
import { createProxyRouter } from "./routes/proxy";
import { createRateLimitRouter } from "./routes/ratelimit";

async function main(): Promise<void> {
  const config = loadConfig();

  const tokenService = new ZpTokenService(config);
  const proxyService = new ProxyPoolService();
  const rateLimitService = new RateLimitService();

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use("/api/boss", createBossRouter(tokenService));
  app.use("/api/xiaohongshu", createXiaohongshuRouter());
  app.use("/api/tiktok", createTikTokRouter());
  app.use("/api/proxy", createProxyRouter(proxyService));
  app.use("/api/ratelimit", createRateLimitRouter(rateLimitService));

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      services: {
        boss: tokenService.isReady ? "ready" : "starting",
        xiaohongshu: "stub",
        tiktok: "stub",
        proxy: "stub",
        ratelimit: "stub",
      },
    });
  });

  const PORT = config.port;
  app.listen(PORT, config.host, () => {
    console.log(`[WebHarvester Backend] 服务已启动 → http://${config.host}:${PORT}`);
    console.log(`[WebHarvester Backend] BOSS 令牌服务初始化中...`);
  });

  tokenService.start()
    .then(() => {
      console.log(`[WebHarvester Backend] BOSS 令牌服务已就绪`);
      console.log(`[WebHarvester Backend] stoken=${tokenService.stoken ? "✓" : "✗"} traceid=${tokenService.traceid ? "✓" : "✗"} cookies=${Object.keys(tokenService.cookies).length}个`);
    })
    .catch((err: Error) => {
      console.error(`[WebHarvester Backend] BOSS 令牌服务启动失败:`, err.message);
    });
}

main().catch((err) => {
  console.error(`[WebHarvester Backend] 启动失败:`, err);
  process.exit(1);
});
