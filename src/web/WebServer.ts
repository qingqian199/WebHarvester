import crypto from "crypto";
import http from "http";
import fs from "fs/promises";
import path from "path";
import os from "os";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
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
import { formatUnitResult, formatUnitResults } from "../utils/formatter";
import { exportResultsToXlsx } from "../utils/exporter/xlsx-exporter";
import { FeatureFlags, DEFAULT_FEATURE_FLAGS } from "../core/features";
import { XhsCrawler } from "../adapters/crawlers/XhsCrawler";
import { ZhihuCrawler } from "../adapters/crawlers/ZhihuCrawler";
import { BilibiliCrawler } from "../adapters/crawlers/BilibiliCrawler";
import { TikTokCrawler } from "../adapters/crawlers/TikTokCrawler";
import { PQueueTaskQueue } from "../adapters/PQueueTaskQueue";
import { HarvestTask, ITaskQueue } from "../core/ports/ITaskQueue";
import { XHS_CONTENT_UNITS, ZHIHU_CONTENT_UNITS, BILI_CONTENT_UNITS, TT_CONTENT_UNITS, BOSS_CONTENT_UNITS } from "../core/models/ContentUnit";
import { validateUrl } from "../utils/url-validator";
import { formatError } from "../core/error/error-registry";
import { Router } from "./Router";

const JWT_EXPIRES_IN = "24h";
const CONFIG_PATH = path.resolve("./config.json");

export class WebServer {
  private server: http.Server | null = null;
  private readonly port: number;
  private readonly logger: ConsoleLogger;
  private readonly sessionManager: FileSessionManager;
  private taskQueue: ITaskQueue | null = null;
  private jwtSecret: string = "";
  private readonly router = new Router();
  private loginAttempts = new Map<string, { count: number; lockUntil: number }>();
  private readonly MAX_LOGIN_ATTEMPTS = 5;
  private readonly LOGIN_LOCK_MINUTES = 15;
  private readonly LOGIN_LOCK_MS: number;

  constructor(logger?: ConsoleLogger, sessionManager?: FileSessionManager, port?: number) {
    this.logger = logger ?? new ConsoleLogger();
    this.sessionManager = sessionManager ?? new FileSessionManager();
    this.port = port ?? 3000;
    this.LOGIN_LOCK_MS = this.LOGIN_LOCK_MINUTES * 60 * 1000;
    this.startLoginAttemptsCleanup();
  }

  async start(port?: number) {
    const listenPort = port ?? this.port;

    // 确保 jwtSecret 和默认用户存在
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

  /** 获取客户端 IP，优先使用 X-Forwarded-For。 */
  private getClientIp(req: http.IncomingMessage): string {
    const forwarded = req.headers["x-forwarded-for"];
    if (forwarded) return (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(",")[0].trim();
    return req.socket.remoteAddress || "unknown";
  }

  /** 定期清理已过期的登录锁定记录，避免 Map 无限增长。 */
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

  /** 注册所有 API 路由到 Router。 */
  private registerRoutes(): void {
    // 免认证路由
    this.router.register("POST", "/api/auth/login", (req, res) => this.handleApiAuthLogin(req, res));
    this.router.register("*", "/health", (req, res) => this.handleHealth(res));
    this.router.register("*", "/api/health", (req, res) => this.handleHealth(res));

    // 采集任务路由
    this.router.register("POST", "/api/run", (req, res) => this.handleApiRun(req, res));
    this.router.register("GET", "/api/batch", (req, res) => this.handleApiBatch(req, res));
    this.router.register("POST", "/api/collect-units", (req, res) => this.handleApiCollectUnits(req, res));
    this.router.register("POST", "/api/task", (req, res) => this.handleApiTaskSubmit(req, res));
    this.router.register("GET", "/api/task/:taskId", (req, res, p) => this.handleApiTaskStatus(req, res, p));
    this.router.register("GET", "/api/tasks/stream", (req, res) => this.handleApiTasksStream(req, res));

    // 登录/会话路由
    this.router.register("POST", "/api/login", (req, res) => this.handleApiLogin(req, res));
    this.router.register("POST", "/api/login/qrcode", (req, res) => this.handleApiQrcode(req, res));
    this.router.register("POST", "/api/login/qrcode/confirm", (req, res) => this.handleApiQrcodeConfirm(req, res));
    this.router.register("POST", "/api/login/qrcode/cleanup", (req, res) => this.handleApiQrcodeCleanup(req, res));
    this.router.register("GET", "/api/profiles", (req, res) => this.handleApiProfiles(req, res));
    this.router.register("GET", "/api/sessions", (req, res) => this.handleApiSessions(req, res));
    this.router.register("DELETE", "/api/sessions/:name", (req, res, p) => this.handleApiDeleteSession(req, res, p));

    // 数据查询路由
    this.router.register("GET", "/api/crawlers", (req, res) => this.handleApiCrawlers(res));
    this.router.register("GET", "/api/content-units", (req, res) => this.handleApiContentUnits(req, res));
    this.router.register("GET", "/api/results", (req, res) => this.handleApiResults(res));
    this.router.register("GET", "/api/results/:filename", (req, res, p) => this.handleApiResultDetail(req, res, p));
    this.router.register("GET", "/api/features", (req, res) => this.handleApiFeatures(res));

    // 数据分析/导出路由
    this.router.register("POST", "/api/analyze", (req, res) => this.handleApiAnalyze(req, res));
    this.router.register("POST", "/api/quick-article", (req, res) => this.handleApiQuickArticle(req, res));
    this.router.register("POST", "/api/export-xlsx", (req, res) => this.handleApiExportXlsx(req, res));
    this.router.register("POST", "/api/format", (req, res) => this.handleApiFormat(req, res));
  }

  private async ensureJwtConfig(): Promise<void> {
    // 优先使用环境变量
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
      // config.json 不存在，写入初始配置
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

  /** 验证 JWT token。成功返回解码后的 payload，失败返回 null。支持 Authorization 头和 ?token= 查询参数。 */
  private verifyAuth(req: http.IncomingMessage): { username: string; role: string } | null {
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

  /** JWT 登录：验证用户名/密码，返回 token。包含 IP 级速率限制。 */
  private async handleApiAuthLogin(req: http.IncomingMessage, res: http.ServerResponse) {
    const body = JSON.parse(await this.getBody(req));
    const { username, password } = body;
    if (!username || !password) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: -1, msg: "缺少用户名或密码" }));
      return;
    }

    // 速率限制检查
    const ip = this.getClientIp(req);
    const attempt = this.loginAttempts.get(ip);
    if (attempt && Date.now() < attempt.lockUntil) {
      const remainingSec = Math.ceil((attempt.lockUntil - Date.now()) / 1000);
      res.writeHead(429, { "Content-Type": "application/json", "Retry-After": String(remainingSec) });
      res.end(JSON.stringify({ error: true, code: "E012", message: "登录尝试过于频繁", suggestion: `请等待 ${Math.ceil(remainingSec / 60)} 分钟后再试` }));
      return;
    }

    try {
      const raw = await fs.readFile(CONFIG_PATH, "utf-8");
      const cfg = JSON.parse(raw);
      const user = (cfg.users || []).find((u: { username: string }) => u.username === username);
      if (!user) {
        this.recordFailedAttempt(ip);
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: true, code: "E011", message: "用户名或密码错误", suggestion: "请检查用户名和密码是否正确" }));
        return;
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        this.recordFailedAttempt(ip);
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: true, code: "E011", message: "用户名或密码错误", suggestion: "请检查用户名和密码是否正确" }));
        return;
      }

      // 登录成功：清除尝试记录
      this.loginAttempts.delete(ip);

      const token = jwt.sign(
        { username: user.username, role: user.role || "admin" },
        this.jwtSecret,
        { expiresIn: JWT_EXPIRES_IN },
      );
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: 0, data: { token, expiresIn: JWT_EXPIRES_IN } }));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: -1, msg: e.message }));
    }
  }

  /** 记录一次失败的登录尝试。达到阈值时锁定 IP。 */
  private recordFailedAttempt(ip: string): void {
    const now = Date.now();
    const record = this.loginAttempts.get(ip) || { count: 0, lockUntil: 0 };
    record.count++;
    if (record.count >= this.MAX_LOGIN_ATTEMPTS) {
      record.lockUntil = now + this.LOGIN_LOCK_MS;
      this.logger.warn(`登录锁定 IP: ${ip}，持续 ${this.LOGIN_LOCK_MINUTES} 分钟`);
    }
    this.loginAttempts.set(ip, record);
  }

  /** 启用任务队列。传入自定义处理器或使用默认的 collect-units 流程。 */
  enableTaskQueue(maxConcurrency = 2): ITaskQueue {
    const queue = new PQueueTaskQueue(maxConcurrency);
    queue.setProcessor(async (task: HarvestTask) => {
      const session = task.sessionName ? await this.sessionManager.load(task.sessionName) : null;
      const crawlerFactory = () => {
// eslint-disable-next-line @typescript-eslint/no-explicit-any
        const map: Record<string, any> = {
          xiaohongshu: new XhsCrawler(),
          zhihu: new ZhihuCrawler(),
          bilibili: new BilibiliCrawler(),
          tiktok: new TikTokCrawler(),
        };
        return map[task.site] ?? null;
      };
      const crawler = crawlerFactory();
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

  private async handleApiRun(req: http.IncomingMessage, res: http.ServerResponse) {
    const body = await this.getBody(req);
    const { url, profile, enhanced } = JSON.parse(body);
    try {
      validateUrl(url);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: -1, msg: "URL 不合法：禁止访问内网地址" }));
      return;
    }
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
      {
        targetUrl: url,
        networkCapture: { captureAll: true, enhancedFullCapture: enhanced === true },
      },
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
  private sessionContext: { lcm: any; page: any; profile: string; loginUrl: string } | null = null;

  private async handleApiQrcode(req: http.IncomingMessage, res: http.ServerResponse) {
    const body = JSON.parse(await this.getBody(req));
    const { profile, loginUrl, autoSave } = body;
    if (!profile || !loginUrl) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: -1, msg: "缺少 profile 或 loginUrl" }));
      return;
    }
    try {
      const { BrowserLifecycleManager } = await import("../adapters/BrowserLifecycleManager");
      const lcm = new BrowserLifecycleManager(this.logger);
      const page = await lcm.launch(loginUrl, false, undefined, "domcontentloaded", 300000);
      await page.waitForLoadState("load", { timeout: 15000 }).catch(() => {});

      await page.evaluate(() => {
        const keywords = ["登录", "登入", "log in", "sign in"];
        const allEls = document.querySelectorAll<HTMLElement>("a, button, div, span, li");
        for (const el of allEls) {
          if (el.offsetWidth === 0 || el.offsetHeight === 0) continue;
          const text = el.textContent?.trim().toLowerCase() || "";
          if (keywords.some((k) => text === k)) { el.click(); return; }
        }
      });
      await page.waitForTimeout(2000);

      if (autoSave) {
        const authKw = ["session", "token", "sid", "sess", "passport"];
        const deadline = Date.now() + 300000;
        let loggedIn = false;
        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 1500));
          try {
            const cookies = await page.context().cookies();
            if (cookies.some((c) => authKw.some((w) => c.name.toLowerCase().includes(w)))) { loggedIn = true; break; }
            const currentUrl = page.url().split("?")[0];
            if (currentUrl !== loginUrl.split("?")[0]) {
              for (let i = 0; i < 10; i++) {
                await new Promise((r) => setTimeout(r, 500));
                const cookies2 = await page.context().cookies();
                if (cookies2.some((c) => authKw.some((w) => c.name.toLowerCase().includes(w)))) { loggedIn = true; break; }
              }
              if (loggedIn) break;
            }
          } catch {}
        }
        if (!loggedIn) { await lcm.close(); res.writeHead(408); res.end(JSON.stringify({ code: -1, msg: "扫码登录超时" })); return; }

        const { captureSessionFromPage } = await import("../utils/session-helper");
        const sessionData = await captureSessionFromPage(page, page.context());
        await this.sessionManager.save(profile, sessionData);
        await lcm.close();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ code: 0, msg: `会话已保存为 [${profile}]` }));
      } else {
        this.sessionContext = { lcm, page, profile, loginUrl };
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ code: 0, data: { profile, loginUrl, sessionId: profile } }));
      }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: -1, msg: e.message }));
    }
  }

  private async handleApiQrcodeConfirm(req: http.IncomingMessage, res: http.ServerResponse) {
    const body = JSON.parse(await this.getBody(req));
    const { profile, save: doSave, sessionData: existingData } = body;

    if (doSave && existingData) {
      try {
        await this.sessionManager.save(profile, existingData);
        if (this.sessionContext?.profile === profile) this.sessionContext = null;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ code: 0, msg: `会话已保存为 [${profile}]` }));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (e: any) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ code: -1, msg: e.message }));
      }
      return;
    }

    if (!profile || !this.sessionContext || this.sessionContext.profile !== profile) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: -1, msg: "未找到登录会话，请重新扫码" }));
      return;
    }
    try {
      const { captureSessionFromPage } = await import("../utils/session-helper");
      const { page, loginUrl } = this.sessionContext;

      const cookies = await page.context().cookies();
      const hasAuth = cookies.some((c: { name: string }) => ["session", "token", "sid", "sess", "passport"].some((w) => c.name.toLowerCase().includes(w)));
      if (!hasAuth) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ code: -1, msg: "未检测到登录态，请确认已完成扫码登录" }));
        return;
      }

      const sessionData = await captureSessionFromPage(page, page.context());
      let userName = "";
      try {
        userName = await page.evaluate(() => {
          const el = document.querySelector<HTMLElement>(".user-name, .header-user-name, [class*=username]");
          return el?.textContent?.trim() || document.title?.split("-")[0]?.trim() || "";
        });
      } catch {}

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        code: 0,
        data: {
          profile,
          sessionData,
          userInfo: { name: userName, domain: new URL(loginUrl).hostname },
        },
      }));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: -1, msg: e.message }));
    }
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

  private async handleApiQrcodeCleanup(req: http.IncomingMessage, res: http.ServerResponse) {
    if (this.sessionContext) {
      try { await this.sessionContext.page.context().close(); } catch (err) { this.logger.warn("QR cleanup page close failed", { err: (err as Error).message }); }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
      try { (this.sessionContext.lcm as any).close(); } catch (err) { this.logger.warn("QR cleanup lcm close failed", { err: (err as Error).message }); }
      this.sessionContext = null;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: 0, msg: "已清理" }));
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
    try {
      validateUrl(url);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: -1, msg: "URL 不合法：禁止访问内网地址" }));
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

  private async handleApiTaskSubmit(req: http.IncomingMessage, res: http.ServerResponse) {
    const body = JSON.parse(await this.getBody(req));
    const { site, units, params, sessionName, authMode } = body;
    if (!site || !units?.length) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: -1, msg: "缺少 site 或 units" }));
      return;
    }
    if (params?.url) {
      try {
        validateUrl(params.url);
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ code: -1, msg: "URL 不合法：禁止访问内网地址" }));
        return;
      }
    }
    if (!this.taskQueue) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: -1, msg: "任务队列未启用" }));
      return;
    }
    const task: HarvestTask = {
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      site, units, params, sessionName, authMode,
      url: params?.url || "",
    };
    await this.taskQueue.enqueue(task);
    res.writeHead(202, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: 0, data: { taskId: task.id, status: this.taskQueue.getStatus() } }));
  }

  private async handleApiTaskStatus(req: http.IncomingMessage, res: http.ServerResponse, params?: Record<string, string>) {
    const taskId = params?.taskId || req.url!.replace("/api/task/", "").split("?")[0];
    if (!this.taskQueue) {
      res.writeHead(503); res.end(JSON.stringify({ code: -1, msg: "任务队列未启用" }));
      return;
    }
    const result = this.taskQueue.getResult(taskId);
    const error = this.taskQueue.getError(taskId);
    const status = this.taskQueue.getStatus();
    const isCompleted = result !== undefined || error !== undefined;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      code: 0,
      data: {
        taskId,
        completed: isCompleted,
        result: result || null,
        error: error || null,
        queueStatus: status,
      },
    }));
  }

  /** SSE 实时任务流端点。 */
  private async handleApiTasksStream(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (!this.taskQueue) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: -1, msg: "任务队列未启用" }));
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    // 发送初始队列状态
    const initial = this.taskQueue.getStatus();
    res.write(`event: queue\ndata: ${JSON.stringify(initial)}\n\n`);

    const onQueueChanged = (data: unknown) => {
      res.write(`event: queue\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const onTaskEvent = (eventType: string, data: unknown) => {
      res.write(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const onTaskStarted = (data: unknown) => onTaskEvent("task", data);
    const onTaskCompleted = (data: unknown) => onTaskEvent("task", data);
    const onTaskFailed = (data: unknown) => onTaskEvent("task", data);

    // 将 queue 作为 EventEmitter 使用
    const queue = this.taskQueue as unknown as { on: (e: string, cb: (...args: unknown[]) => void) => void; off: (e: string, cb: (...args: unknown[]) => void) => void };
    queue.on("queue:changed", onQueueChanged);
    queue.on("task:started", onTaskStarted);
    queue.on("task:completed", onTaskCompleted);
    queue.on("task:failed", onTaskFailed);

    // 心跳保持连接
    const heartbeat = setInterval(() => {
      res.write(":heartbeat\n\n");
    }, 15000);

    req.on("close", () => {
      clearInterval(heartbeat);
      queue.off("queue:changed", onQueueChanged);
      queue.off("task:started", onTaskStarted);
      queue.off("task:completed", onTaskCompleted);
      queue.off("task:failed", onTaskFailed);
    });
  }

  private async handleApiContentUnits(req: http.IncomingMessage, res: http.ServerResponse) {
    const site = new URL(req.url!, `http://${req.headers.host}`).searchParams.get("site") || "";
    const map: Record<string, readonly typeof XHS_CONTENT_UNITS[0][]> = {
      xiaohongshu: XHS_CONTENT_UNITS,
      zhihu: ZHIHU_CONTENT_UNITS,
      bilibili: BILI_CONTENT_UNITS,
      tiktok: TT_CONTENT_UNITS,
      boss_zhipin: BOSS_CONTENT_UNITS,
    };
    const units = map[site] ?? [];
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: 0, data: units }));
  }

  private async handleApiFeatures(res: http.ServerResponse) {
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

  private async handleApiExportXlsx(req: http.IncomingMessage, res: http.ServerResponse) {
    const body = JSON.parse(await this.getBody(req));
    const { results } = body;
    if (!results || !Array.isArray(results)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: -1, msg: "需要 results[]" }));
      return;
    }
    try {
      const buf = exportResultsToXlsx(results);
      res.writeHead(200, {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": "attachment; filename=harvest.xlsx",
      });
      res.end(buf);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: -1, msg: e.message }));
    }
  }

  private async handleApiFormat(req: http.IncomingMessage, res: http.ServerResponse) {
    const body = JSON.parse(await this.getBody(req));
    const { units, results } = body;
    if (units && Array.isArray(units)) {
// eslint-disable-next-line @typescript-eslint/no-explicit-any
      const formatted = units.map((u: any) => formatUnitResult(u.unit || u.id, u.data));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: 0, data: formatted }));
    } else if (results && Array.isArray(results)) {
      const text = formatUnitResults(results);
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(text);
    } else {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: -1, msg: "需要 units[] 或 results[]" }));
    }
  }

  private async handleApiCollectUnits(req: http.IncomingMessage, res: http.ServerResponse) {
    const body = JSON.parse(await this.getBody(req));
    const { site, units, params: userParams, sessionName, authMode } = body;
    if (!site || !units?.length) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: -1, msg: "缺少 site 或 units" }));
      return;
    }
    // URL 安全校验
    if (userParams?.url) {
      try {
        validateUrl(userParams.url);
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ code: -1, msg: "URL 不合法：禁止访问内网地址" }));
        return;
      }
    }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
    let session: any = undefined;
    if (sessionName) {
      const state = await this.sessionManager.load(sessionName);
      if (state) session = { cookies: state.cookies, localStorage: state.localStorage };
    }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
    const crawlerMap: Record<string, any> = {
      xiaohongshu: new XhsCrawler(),
      zhihu: new ZhihuCrawler(),
      bilibili: new BilibiliCrawler(),
      tiktok: new TikTokCrawler(),
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  private async handleApiDeleteSession(req: http.IncomingMessage, res: http.ServerResponse, params?: Record<string, string>) {
    const name = params?.name || req.url!.replace("/api/sessions/", "").split("?")[0];
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
          } catch {}
          entries.push({ filename: `${dir.name}/${f}`, url, timestamp: stat.mtime.toISOString(), size: stat.size });
        }
      }
    } catch {}
    entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: 0, data: entries }));
  }

  private async handleApiResultDetail(req: http.IncomingMessage, res: http.ServerResponse, params?: Record<string, string>) {
    const rawName = decodeURIComponent(params?.filename || req.url!.replace("/api/results/", ""));
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
      version: (pkg as { version: string }).version || "1.0.0",
      platform: os.platform(),
      memoryUsage: process.memoryUsage(),
      profileCount,
      taskQueueLength: this.taskQueue?.getStatus().pending ?? 0,
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
