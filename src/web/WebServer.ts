import crypto from "crypto";
import http from "http";
import fs from "fs/promises";
import path from "path";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { ConsoleLogger } from "../adapters/ConsoleLogger";
import { FileSessionManager } from "../adapters/FileSessionManager";
import { XhsCrawler } from "../adapters/crawlers/XhsCrawler";
import { ZhihuCrawler } from "../adapters/crawlers/ZhihuCrawler";
import { BilibiliCrawler } from "../adapters/crawlers/BilibiliCrawler";
import { TikTokCrawler } from "../adapters/crawlers/TikTokCrawler";
import { PQueueTaskQueue } from "../adapters/PQueueTaskQueue";
import { HarvestTask, ITaskQueue } from "../core/ports/ITaskQueue";
import { formatError } from "../core/error/error-registry";
import { Router } from "./Router";
import { ServerContext } from "./routes/context";
import { registerAuthRoutes } from "./routes/auth";
import { registerHarvestRoutes } from "./routes/harvest";
import { registerSessionRoutes } from "./routes/session";
import { registerDataRoutes } from "./routes/data";
import { registerSystemRoutes } from "./routes/system";
import { registerMcpRoutes } from "./routes/mcp";

const CONFIG_PATH = path.resolve("./config.json");

export class WebServer {
  private server: http.Server | null = null;
  private readonly port: number;
  private readonly logger: ConsoleLogger;
  readonly sessionManager: FileSessionManager;
  taskQueue: ITaskQueue | null = null;
  private jwtSecret: string = "";
  private readonly router = new Router();
  loginAttempts = new Map<string, { count: number; lockUntil: number }>();
  private readonly MAX_LOGIN_ATTEMPTS = 5;
  private readonly LOGIN_LOCK_MINUTES = 15;
  private readonly LOGIN_LOCK_MS: number;
  sessionContext: { lcm: any; page: any; profile: string; loginUrl: string } | null = null;

  constructor(logger?: ConsoleLogger, sessionManager?: FileSessionManager, port?: number) {
    this.logger = logger ?? new ConsoleLogger();
    this.sessionManager = sessionManager ?? new FileSessionManager();
    this.port = port ?? 3000;
    this.LOGIN_LOCK_MS = this.LOGIN_LOCK_MINUTES * 60 * 1000;
    this.startLoginAttemptsCleanup();
  }

  async start(port?: number) {
    const listenPort = port ?? this.port;

    await this.ensureJwtConfig();
    this.registerRoutes();

    this.server = http.createServer(async (req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      // 静态文件 — 无需认证
      if (req.url === "/" || req.url === "/index.html") return this.serveStatic(res, "static/index.html", "text/html");
      if (req.url === "/style.css") return this.serveStatic(res, "static/style.css", "text/css");
      if (req.url === "/api.js") return this.serveStatic(res, "static/api.js", "application/javascript");

      // JWT 认证（对所有 /api/ 路径，除了 auth 相关和静态文件）
      if (req.url?.startsWith("/api/") && !req.url.startsWith("/api/auth/") && req.url !== "/api/auth/login") {
        const authResult = this.verifyAuth(req);
        if (!authResult) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ code: -1, msg: "未授权，请先登录" }));
          return;
        }
      }

      const url = req.url || "/";
      const resolved = this.router.resolve(req.method || "GET", url);
      if (resolved) {
        try {
          await resolved.handler(req, res, resolved.params);
        } catch (e) {
          const errMsg = (e as Error).message;
          this.logger.warn(formatError("E001", errMsg));
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ code: -1, msg: errMsg }));
        }
      } else {
        res.writeHead(404);
        res.end("Not Found");
      }
    });

    this.server.listen(listenPort, () => {
      this.logger.info(`🌐 可视化面板：http://localhost:${listenPort}`);
    });
  }

  private registerRoutes(): void {
    const ctx: ServerContext = {
      logger: this.logger,
      sessionManager: this.sessionManager,
      getTaskQueue: () => this.taskQueue,
      jwtSecret: this.jwtSecret,
      loginAttempts: this.loginAttempts,
      sessionContext: this.sessionContext,
      getClientIp: (req) => this.getClientIp(req),
      getBody: (req) => this.getBody(req),
    };

    registerAuthRoutes(this.router, ctx);
    registerHarvestRoutes(this.router, ctx);
    registerSessionRoutes(this.router, ctx);
    registerDataRoutes(this.router, ctx);
    registerSystemRoutes(this.router, ctx);
    registerMcpRoutes(this.router, ctx);
  }

  getClientIp(req: http.IncomingMessage): string {
    const forwarded = req.headers["x-forwarded-for"];
    if (forwarded) return (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(",")[0].trim();
    return req.socket.remoteAddress || "unknown";
  }

  private startLoginAttemptsCleanup(): void {
    const interval = setInterval(() => {
      const now = Date.now();
      for (const [ip, record] of this.loginAttempts) {
        if (now >= record.lockUntil) {
          this.loginAttempts.delete(ip);
        }
      }
    }, 30 * 60 * 1000);
    if (typeof interval === "object" && "unref" in interval) {
      interval.unref();
    }
  }

  private async ensureJwtConfig(): Promise<void> {
    const envSecret = process.env.WEBHARVESTER_JWT_SECRET;
    if (envSecret) {
      this.jwtSecret = envSecret;
      return;
    }

    try {
      const raw = await fs.readFile(CONFIG_PATH, "utf-8");
      const cfg = JSON.parse(raw);
      let changed = false;

      if (!cfg.jwtSecret) {
        cfg.jwtSecret = crypto.randomBytes(32).toString("hex");
        changed = true;
      }
      this.jwtSecret = cfg.jwtSecret;

      if (!cfg.users || cfg.users.length === 0) {
        const defaultHash = await bcrypt.hash("admin", 10);
        cfg.users = [{ username: "admin", passwordHash: defaultHash, role: "admin" }];
        changed = true;
      }

      if (changed) {
        await fs.writeFile(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf-8");
        this.logger.info("已生成 JWT 配置（jwtSecret + 默认用户 admin/admin）");
      }
    } catch {
      const defaultHash = await bcrypt.hash("admin", 10);
      this.jwtSecret = crypto.randomBytes(32).toString("hex");
      const cfg = {
        jwtSecret: this.jwtSecret,
        users: [{ username: "admin", passwordHash: defaultHash, role: "admin" }],
      };
      await fs.writeFile(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf-8");
      this.logger.info("已创建 config.json（含 JWT 配置）");
    }
  }

  verifyAuth(req: http.IncomingMessage): { username: string; role: string } | null {
    let token: string | null = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.slice(7);
    } else if (req.url) {
      const parsed = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      token = parsed.searchParams.get("token");
    }
    if (!token) return null;
    try {
      return jwt.verify(token, this.jwtSecret, { algorithms: ["HS256"] }) as { username: string; role: string };
    } catch {
      return null;
    }
  }

  enableTaskQueue(maxConcurrency = 2): ITaskQueue {
    const queue = new PQueueTaskQueue(maxConcurrency);
    queue.setProcessor(async (task: HarvestTask) => {
      const session = task.sessionName ? await this.sessionManager.load(task.sessionName) : null;
      const crawlerMap: Record<string, any> = {
        xiaohongshu: new XhsCrawler(),
        zhihu: new ZhihuCrawler(),
        bilibili: new BilibiliCrawler(),
        tiktok: new TikTokCrawler(),
      };
      const crawler = crawlerMap[task.site] ?? null;
      if (!crawler) throw new Error(`未知站点: ${task.site}`);
      const sessionData = session ? { cookies: session.cookies, localStorage: session.localStorage } : undefined;
      return crawler.collectUnits(task.units || [], task.params || {}, sessionData, task.authMode);
    });
    this.taskQueue = queue;
    return queue;
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

  private getBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks).toString()));
      req.on("error", reject);
    });
  }
}
