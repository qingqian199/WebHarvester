import http from "http";
import fs from "fs/promises";
import path from "path";
import os from "os";
import pkg from "../../package.json";
import { loadAppConfig } from "../utils/config-loader";
import { ConsoleLogger } from "../adapters/ConsoleLogger";
import { PlaywrightAdapter } from "../adapters/PlaywrightAdapter";
import { FileStorageAdapter } from "../adapters/FileStorageAdapter";
import { HarvesterService } from "../core/services/HarvesterService";
import { BatchHarvestService } from "../services/BatchHarvestService";
import { FileSessionManager } from "../adapters/FileSessionManager";
import { AuthGuard } from "../utils/auth-guard";
import { ResultAnalyzer } from "../utils/analyzer";
import { loadBatchTasks } from "../utils/batch-loader";
import { HarvestResult } from "../core/models";
import { ArticleCaptureService } from "../services/ArticleCaptureService";
import { XhsCrawler } from "../adapters/crawlers/XhsCrawler";
import { ZhihuCrawler } from "../adapters/crawlers/ZhihuCrawler";
import { BilibiliCrawler } from "../adapters/crawlers/BilibiliCrawler";
import { XHS_CONTENT_UNITS, ZHIHU_CONTENT_UNITS, BILI_CONTENT_UNITS } from "../core/models/ContentUnit";

export class WebServer {
  private server: http.Server | null = null;
  private readonly port: number;
  private readonly logger: ConsoleLogger;
  private readonly sessionManager: FileSessionManager;

  constructor(logger?: ConsoleLogger, sessionManager?: FileSessionManager, port?: number) {
    this.logger = logger ?? new ConsoleLogger();
    this.sessionManager = sessionManager ?? new FileSessionManager();
    this.port = port ?? 3000;
  }

  async start(port?: number) {
    const listenPort = port ?? this.port;
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
        } else if (req.url === "/api/quick-article" && req.method === "POST") {
          await this.handleApiQuickArticle(req, res);
        } else if (req.url === "/api/crawlers" && req.method === "GET") {
          await this.handleApiCrawlers(res);
        } else if (req.url === "/api/content-units" && req.method === "GET") {
          await this.handleApiContentUnits(req, res);
        } else if (req.url === "/api/collect-units" && req.method === "POST") {
          await this.handleApiCollectUnits(req, res);
        } else if (req.url === "/api/sessions" && req.method === "GET") {
          await this.handleApiSessions(req, res);
        } else if (req.url?.startsWith("/api/sessions/") && req.method === "DELETE") {
          await this.handleApiDeleteSession(req, res);
        } else if (req.url === "/api/results" && req.method === "GET") {
          await this.handleApiResults(res);
        } else if (req.url?.startsWith("/api/results/") && req.method === "GET") {
          await this.handleApiResultDetail(req, res);
        } else {
          res.writeHead(404);
          res.end("Not Found");
        }
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ code: -1, msg: (e as Error).message }));
      }
    });

    this.server.listen(listenPort, () => {
      this.logger.info(`🌐 可视化面板：http://localhost:${listenPort}`);
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

  private async handleApiQuickArticle(req: http.IncomingMessage, res: http.ServerResponse) {
    const body = await this.getBody(req);
    const { url } = JSON.parse(body);
    if (!url) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: -1, msg: "缺少 url 参数" }));
      return;
    }
    const service = new ArticleCaptureService(this.logger);
    const result = await service.capture(url);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: 0, data: result }));
  }

  private async handleApiCrawlers(res: http.ServerResponse) {
    const appCfg = await loadAppConfig();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: 0, data: appCfg.crawlers ?? {} }));
  }

  private async handleApiContentUnits(req: http.IncomingMessage, res: http.ServerResponse) {
    const site = new URL(req.url!, `http://${req.headers.host}`).searchParams.get("site") || "";
    const map: Record<string, typeof XHS_CONTENT_UNITS> = {
      xiaohongshu: XHS_CONTENT_UNITS,
      zhihu: ZHIHU_CONTENT_UNITS,
      bilibili: BILI_CONTENT_UNITS,
    };
    const units = map[site] ?? [];
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: 0, data: units }));
  }

  private async handleApiCollectUnits(req: http.IncomingMessage, res: http.ServerResponse) {
    const body = JSON.parse(await this.getBody(req));
    const { site, units, params: userParams, sessionName, authMode } = body;
    if (!site || !units?.length) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: -1, msg: "缺少 site 或 units" }));
      return;
    }

    let session: any = undefined;
    if (sessionName) {
      const state = await this.sessionManager.load(sessionName);
      if (state) session = { cookies: state.cookies, localStorage: state.localStorage };
    }

    const crawlerMap: Record<string, any> = {
      xiaohongshu: new XhsCrawler(),
      zhihu: new ZhihuCrawler(),
      bilibili: new BilibiliCrawler(),
    };
    const crawler = crawlerMap[site];
    if (!crawler) {
      res.writeHead(400); res.end(JSON.stringify({ code: -1, msg: `未知站点: ${site}` }));
      return;
    }

    try {
      const results = await crawler.collectUnits(units, userParams || {}, session, authMode);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: 0, data: results }));
    } catch (e: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: -1, msg: e.message }));
    }
  }

  private async handleApiSessions(req: http.IncomingMessage, res: http.ServerResponse) {
    const profiles = await this.sessionManager.listProfiles();
    const data = await Promise.all(profiles.map(async (name) => {
      const state = await this.sessionManager.load(name);
      if (!state) return { name, status: "error", cookies: 0, createdAt: null };
      const ageHours = (Date.now() - state.createdAt) / 3600000;
      return { name, status: ageHours > 336 ? "expired" : "valid", cookies: state.cookies.length, createdAt: state.createdAt };
    }));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: 0, data }));
  }

  private async handleApiDeleteSession(req: http.IncomingMessage, res: http.ServerResponse) {
    const name = req.url!.replace("/api/sessions/", "").split("?")[0];
    await this.sessionManager.deleteProfile(name);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: 0, msg: `已删除会话 ${name}` }));
  }

  private async handleApiResults(res: http.ServerResponse) {
    const outputDir = path.resolve("output");
    const entries: Array<{ filename: string; url: string; timestamp: string; size: number }> = [];
    try {
      const dirs = await fs.readdir(outputDir, { withFileTypes: true });
      for (const dir of dirs) {
        if (!dir.isDirectory()) continue;
        const files = await fs.readdir(path.join(outputDir, dir.name));
        for (const f of files) {
          if (!f.endsWith(".json")) continue;
          const fullPath = path.join(outputDir, dir.name, f);
          const stat = await fs.stat(fullPath);
          let url = "";
          try {
            const content = await fs.readFile(fullPath, "utf-8");
            const parsed = JSON.parse(content);
            url = parsed.targetUrl ?? parsed.url ?? "";
          } catch { /* ignore parse errors */ }
          entries.push({ filename: `${dir.name}/${f}`, url, timestamp: stat.mtime.toISOString(), size: stat.size });
        }
      }
    } catch { /* no output dir */ }
    entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: 0, data: entries }));
  }

  private async handleApiResultDetail(req: http.IncomingMessage, res: http.ServerResponse) {
    const rawName = decodeURIComponent(req.url!.replace("/api/results/", ""));
    const safeName = path.normalize(rawName).replace(/^(\.\.(\/|\\))+/, "");
    const fullPath = path.resolve("output", safeName);
    if (!fullPath.startsWith(path.resolve("output"))) {
      res.writeHead(403); res.end(JSON.stringify({ code: -1, msg: "路径穿越拦截" })); return;
    }
    try {
      const content = await fs.readFile(fullPath, "utf-8");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: 0, data: JSON.parse(content) }));
    } catch {
      res.writeHead(404); res.end(JSON.stringify({ code: -1, msg: "文件不存在" }));
    }
  }

  private async handleHealth(res: http.ServerResponse) {
    const profileCount = await this.sessionManager.listProfiles().then(p => p.length).catch(() => 0);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "ok",
      uptime: process.uptime(),
      version: (pkg as any).version || "1.0.0",
      platform: os.platform(),
      memoryUsage: process.memoryUsage(),
      profileCount,
      taskQueueLength: 0,
      activeBrowsers: 0,
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
