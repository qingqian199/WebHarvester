import { spawn, ChildProcess } from "child_process";
import path from "path";
import os from "os";
import fs from "fs";
import fetch from "node-fetch";
import { ConsoleLogger } from "../adapters/ConsoleLogger";

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
  private _port: number;
  private _chromePath: string;
  private _userDataDir: string;
  private _startTime = 0;
  private healthTimer: ReturnType<typeof setInterval> | null = null;
  private logger = new ConsoleLogger("info");

  constructor(port = 9222, chromePath?: string, userDataDir?: string) {
    this._port = port;
    this._chromePath = chromePath || process.env.WEBHARVESTER_CHROME_PATH || this.detectChrome();
    this._userDataDir = userDataDir || process.env.WEBHARVESTER_CHROME_DATA_DIR || DEFAULT_USER_DATA_DIR;
  }

  get port(): number { return this._port; }
  get isReady(): boolean { return this._ready; }
  get uptime(): number { return this._ready ? Date.now() - this._startTime : 0; }

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
      this.logger.warn(`Chrome 进程异常退出 (code=${code})，将在 10s 后自动重启`);
      this._ready = false;
      this.proc = null;
      setTimeout(() => this.start().catch(() => {}), 10000);
    });

    this.proc.on("error", (err) => {
      this.logger.warn(`Chrome 进程启动失败: ${err.message}`);
      this._ready = false;
    });

    for (let i = 0; i < 30; i++) {
      if (await this.checkHealthFast()) {
        this._ready = true;
        this.logger.info(`ChromeService 已就绪 (pid=${this.proc.pid}, port=${this._port})`);
        break;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }

    if (!this._ready) {
      this.logger.warn("ChromeService 启动超时，请检查 Chrome 是否可正常启动");
    }

    this.healthTimer = setInterval(async () => {
      const ok = await this.checkHealthFast();
      if (!ok && this._ready) {
        this.logger.warn("Chrome 健康检查失败，标记为不可用");
        this._ready = false;
      } else if (ok && !this._ready && this.proc) {
        this._ready = true;
        this.logger.info("ChromeService 已自动恢复");
      }
    }, 10000);
    if (typeof this.healthTimer === "object" && "unref" in this.healthTimer) {
      this.healthTimer.unref();
    }
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

  getHealth(): { status: string; port: number; uptime: number } {
    return { status: this._ready ? "ready" : "stopped", port: this._port, uptime: this.uptime };
  }

  stop(): void {
    if (this.healthTimer) { clearInterval(this.healthTimer); this.healthTimer = null; }
    if (this.proc) {
      try { this.proc.kill("SIGTERM"); this.logger.info("ChromeService 已停止"); } catch {}
      this.proc = null;
    }
    this._ready = false;
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
