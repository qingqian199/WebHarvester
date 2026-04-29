import http from "http";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { ConsoleLogger } from "../adapters/ConsoleLogger";
import { PlaywrightAdapter } from "../adapters/PlaywrightAdapter";
import { FileStorageAdapter } from "../adapters/FileStorageAdapter";
import { HarvesterService } from "../core/services/HarvesterService";
import { BatchHarvestService } from "../services/BatchHarvestService";
import { FileSessionManager } from "../adapters/FileSessionManager";
import { AuthGuard } from "../utils/auth-guard";
import { ResultAnalyzer } from "../utils/analyzer";
import { loadAppConfig } from "../utils/config-loader";
import { loadBatchTasks } from "../utils/batch-loader";
import { HarvestResult } from "../core/models";

export class WebServer {
  private server: http.Server | null = null;
  private readonly port = 3000;
  private readonly logger: ConsoleLogger;
  private readonly sessionManager: FileSessionManager;

  constructor(logger?: ConsoleLogger, sessionManager?: FileSessionManager) {
    this.logger = logger ?? new ConsoleLogger();
    this.sessionManager = sessionManager ?? new FileSessionManager();
  }

  async start() {
    this.server = http.createServer(async (req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.url === "/" || req.url === "/index.html") return this.serveStatic(res, "static/index.html", "text/html");
      if (req.url === "/style.css") return this.serveStatic(res, "static/style.css", "text/css");
      if (req.url === "/api.js") return this.serveStatic(res, "static/api.js", "application/javascript");

      try {
        if (req.url === "/health" || req.url === "/api/health") {
          await this.handleHealth(res);
        } else if (req.url === "/api/run" && req.method === "POST") {
          await this.handleApiRun(req, res);
        } else if (req.url === "/api/batch" && req.method === "GET") {
          await this.handleApiBatch(req, res);
        } else if (req.url === "/api/login" && req.method === "POST") {
          await this.handleApiLogin(req, res);
        } else if (req.url === "/api/profiles" && req.method === "GET") {
          await this.handleApiProfiles(req, res);
        } else if (req.url === "/api/analyze" && req.method === "POST") {
          await this.handleApiAnalyze(req, res);
        } else {
          res.writeHead(404);
          res.end("Not Found");
        }
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ code: -1, msg: (e as Error).message }));
      }
    });

    this.server.listen(this.port, () => {
      this.logger.info(`🌐 可视化面板：http://localhost:${this.port}`);
    });
  }

  stop() {
    this.server?.close();
  }

  private async serveStatic(res: http.ServerResponse, filePath: string, mime: string) {
    try {
      const content = await fs.readFile(path.resolve(filePath));
      res.writeHead(200, { "Content-Type": mime });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end("File Not Found");
    }
  }

  private async handleApiRun(req: http.IncomingMessage, res: http.ServerResponse) {
    const body = await this.getBody(req);
    const { url, profile } = JSON.parse(body);
    const appCfg = await loadAppConfig();

    let sessionState = null;
    if (profile) {
      const authGuard = new AuthGuard(this.sessionManager);
      sessionState = await authGuard.ensureAuth(profile, url, url);
      if (!sessionState) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ code: -1, msg: "登录状态获取失败" }));
        return;
      }
    }

    const browser = new PlaywrightAdapter(this.logger);
    const storage = new FileStorageAdapter(appCfg.outputDir);
    const svc = new HarvesterService(this.logger, browser, storage);
    await svc.harvest(
      { targetUrl: url, networkCapture: { captureAll: true } },
      "all",
      false,
      this.sessionManager,
      profile,
      sessionState ?? undefined
    );

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: 0, msg: "采集完成" }));
  }

  private async handleApiBatch(req: http.IncomingMessage, res: http.ServerResponse) {
    const { tasks, concurrency } = await loadBatchTasks();
    const appCfg = await loadAppConfig();
    const batch = new BatchHarvestService(this.logger, appCfg.outputDir, concurrency);
    await batch.runBatch(tasks);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: 0, msg: "批量采集完成" }));
  }

  private async handleApiLogin(req: http.IncomingMessage, res: http.ServerResponse) {
    const body = await this.getBody(req);
    const { profile, loginUrl, verifyUrl } = JSON.parse(body);

    const authGuard = new AuthGuard(this.sessionManager);
    const session = await authGuard.ensureAuth(profile, loginUrl, verifyUrl);

    res.writeHead(200, { "Content-Type": "application/json" });
    if (session) {
      res.end(JSON.stringify({ code: 0, msg: "登录成功", profile }));
    } else {
      res.end(JSON.stringify({ code: -1, msg: "登录失败或超时" }));
    }
  }

  private async handleApiProfiles(req: http.IncomingMessage, res: http.ServerResponse) {
    const profiles = await this.sessionManager.listProfiles();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: 0, data: profiles }));
  }

  private async handleApiAnalyze(req: http.IncomingMessage, res: http.ServerResponse) {
    const body = await this.getBody(req);
    const { filePath } = JSON.parse(body);

    const raw = await fs.readFile(filePath, "utf-8");
    const result: HarvestResult = JSON.parse(raw);
    const summary = ResultAnalyzer.summarize(result);
    const html = ResultAnalyzer.generateHtmlReport(summary, result);

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  }

  private async handleHealth(res: http.ServerResponse) {
    const profileCount = await this.sessionManager.listProfiles().then(p => p.length).catch(() => 0);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "ok",
      uptime: process.uptime(),
      memory: process.memoryUsage().rss,
      platform: os.platform(),
      profileCount,
    }));
  }

  private getBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks).toString()));
      req.on("error", reject);
    });
  }
}
