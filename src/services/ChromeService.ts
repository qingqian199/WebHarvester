import { spawn, ChildProcess } from "child_process";
import path from "path";
import os from "os";
import fs from "fs";
import fetch from "node-fetch";
import { ConsoleLogger } from "../adapters/ConsoleLogger";
import { ConsoleNotifier } from "../utils/notifier";

const DEFAULT_CHROME_PATHS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
];

const DEFAULT_USER_DATA_DIR = path.join(os.tmpdir(), "webharvester-chrome-data");

export class ChromeService {
  private proc: ChildProcess | null = null;
  private _ready = false;
  private _degraded = false;
  private _port: number;
  private _chromePath: string;
  private _userDataDir: string;
  private _startTime = 0;
  private healthTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private _restartCount = 0;
  private consecutiveFailures = 0;
  private readonly maxRestarts = 3;
  private readonly heartbeatIntervalMs = 15000;
  private readonly maxConsecutiveFailures = 2;
  private logger = new ConsoleLogger("info");
  private notifier = new ConsoleNotifier();

  constructor(port = 9222, chromePath?: string, userDataDir?: string) {
    this._port = port;
    this._chromePath = chromePath || process.env.WEBHARVESTER_CHROME_PATH || this.detectChrome();
    this._userDataDir = userDataDir || process.env.WEBHARVESTER_CHROME_DATA_DIR || DEFAULT_USER_DATA_DIR;
  }

  get port(): number { return this._port; }
  get isReady(): boolean { return this._ready; }
  get isDegraded(): boolean { return this._degraded; }
  get uptime(): number { return this._ready ? Date.now() - this._startTime : 0; }
  get restartCount(): number { return this._restartCount; }

  /** 返回详细的健康状态报告 */
  getHealth(): { status: string; port: number; uptime: number; degraded: boolean; restartCount: number } {
    return {
      status: this._ready ? "ready" : this._degraded ? "degraded" : "stopped",
      port: this._port,
      uptime: this.uptime,
      degraded: this._degraded,
      restartCount: this._restartCount,
    };
  }

  /** 返回是否健康可用于采集 */
  isHealthy(): boolean {
    return this._ready && !this._degraded;
  }

  private detectChrome(): string {
    for (const p of DEFAULT_CHROME_PATHS) {
      try {
        if (fs.existsSync(p)) return p;
      } catch {}
    }
    return "chrome";
  }

  async start(): Promise<void> {
    if (this._ready) return;
    this.logger.info(`ChromeService 启动中 (端口 ${this._port})...`);
    this._startTime = Date.now();

    this.proc = spawn(this._chromePath, [
      `--remote-debugging-port=${this._port}`,
      `--user-data-dir=${this._userDataDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-field-trial-config",
      "--disable-background-networking",
      "--disable-sync",
      "--disable-translate",
      "--disable-default-apps",
      "--mute-audio",
      "--window-size=1280,720",
    ], { stdio: "ignore", detached: false });

    this.proc.on("exit", (code) => {
      this.logger.warn(`Chrome 进程退出 (code=${code})`);
      this._ready = false;
      this.proc = null;
      this.scheduleRestart();
    });

    this.proc.on("error", (err) => {
      this.logger.warn(`Chrome 进程启动失败: ${err.message}`);
      this._ready = false;
    });

    for (let i = 0; i < 30; i++) {
      if (await this.checkHealthFast()) {
        this._ready = true;
        this._degraded = false;
        this.consecutiveFailures = 0;
        this.logger.info(`ChromeService 已就绪 (pid=${this.proc?.pid}, port=${this._port})`);
        await this.autoSyncCookies();
        break;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }

    if (!this._ready) {
      this.logger.warn("ChromeService 启动超时");
      this.scheduleRestart();
    }

    // 旧的健康检查（仅进程级）
    this.healthTimer = setInterval(async () => {
      const ok = await this.checkHealthFast();
      if (!ok && this._ready) {
        this.logger.warn("Chrome 进程健康检查失败");
        this._ready = false;
      } else if (ok && !this._ready && this.proc) {
        this._ready = true;
        this._degraded = false;
        this.logger.info("ChromeService 已自动恢复");
      }
    }, 10000);
    if (typeof this.healthTimer === "object" && "unref" in this.healthTimer) (this.healthTimer as any).unref();

    // 新的 CDP 心跳检测（连接级）
    this.startHeartbeat();
  }

  /** CDP 心跳：每 15s 发送 Browser.getVersion，连续失败 2 次则重启 */
  private startHeartbeat(): void {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${this._port}/json/version`, { timeout: 5000 } as any);
        if (res.status === 200) {
          this.consecutiveFailures = 0;
          if (!this._ready) {
            this._ready = true;
            this._degraded = false;
            this.logger.info("CDP 连接已自动恢复");
            await this.autoSyncCookies();
          }
          return;
        }
      } catch {}

      this.consecutiveFailures++;
      if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
        this.logger.warn(`CDP 心跳连续 ${this.consecutiveFailures} 次失败，触发重启`);
        this._ready = false;
        this.restart();
      }
    }, this.heartbeatIntervalMs);
    if (typeof this.heartbeatTimer === "object" && "unref" in this.heartbeatTimer) (this.heartbeatTimer as any).unref();
  }

  /** 重启 Chrome。达到最大重启次数后标记 degraded */
  private restart(): void {
    this._restartCount++;
    this.stop();
    if (this._restartCount > this.maxRestarts) {
      this._degraded = true;
      this.notifier.sendAlert("error", "🔴 ChromeService 达到最大重启次数", `已重启 ${this._restartCount} 次，标记为 degraded，爬虫将降级到 Playwright Stealth 模式`);
      return;
    }
    this.notifier.sendAlert("warn", "🔄 ChromeService 自动重启", `第 ${this._restartCount}/${this.maxRestarts} 次`);
    setTimeout(() => this.start().catch(() => {}), 10000);
  }

  private scheduleRestart(): void {
    if (this._degraded) return;
    this._restartCount++;
    if (this._restartCount > this.maxRestarts) {
      this._degraded = true;
      this.notifier.sendAlert("error", "🔴 ChromeService 达到最大重启次数", `已重启 ${this._restartCount} 次，标记为 degraded`);
      return;
    }
    this.logger.info(`ChromeService 将在 10s 后重启 (第 ${this._restartCount}/${this.maxRestarts} 次)`);
    setTimeout(() => this.start().catch(() => {}), 10000);
  }

  async getWebSocketUrl(): Promise<string> {
    const res = await fetch(`http://127.0.0.1:${this._port}/json`, { timeout: 5000 });
    let list: Array<{ webSocketDebuggerUrl: string }>;
    try {
      list = await res.json() as Array<{ webSocketDebuggerUrl: string }>;
    } catch {
      throw new Error("Chrome /json 返回非 JSON 响应");
    }
    const page = list.find((p) => p.webSocketDebuggerUrl);
    if (!page) throw new Error("Chrome 无可用 Page");
    return page.webSocketDebuggerUrl;
  }

  stop(): void {
    if (this.healthTimer) { clearInterval(this.healthTimer); this.healthTimer = null; }
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    if (this.proc) {
      try { this.proc.kill("SIGTERM"); this.logger.info("ChromeService 已停止"); } catch {}
      this.proc = null;
    }
    this._ready = false;
  }

  private async autoSyncCookies(): Promise<void> {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const { CookieSyncService } = await import("./cookie-sync-service");
      const svc = new CookieSyncService();
      const synced = await svc.syncFromCDPToSessions();
      if (synced.length > 0) {
        this.logger.info(`ChromeService Cookie 同步完成: ${synced.join(", ")}`);
      }
    } catch (e: any) {
      this.logger.warn(`Cookie 同步失败: ${e.message}`);
    }
  }

  private async checkHealthFast(): Promise<boolean> {
    try {
      const res = await fetch(`http://127.0.0.1:${this._port}/json/version`, { timeout: 3000 } as any);
      return res.status === 200;
    } catch {
      return false;
    }
  }
}
