import fs from "fs";
import path from "path";
import { ConsoleLogger } from "../adapters/ConsoleLogger.js";
import { getChromeServiceHealth } from "../utils/chrome-service-bridge.js";
import { FeatureFlags } from "../core/features.js";

// ── Types ──

export interface SystemHealth {
  status: "healthy" | "degraded" | "unhealthy";
  components: Array<{
    name: string;
    status: "ok" | "warn" | "error";
    detail: string;
  }>;
}

export interface DiagnosticsReport {
  timestamp: string;
  systemHealth: SystemHealth;
  outputDir: { exists: boolean; fileCount: number; sizeMb: number };
  sessions: { exists: boolean; count: number };
  config: { exists: boolean; path: string };
}

export const DEFAULT_DIAGNOSTICS_OPTIONS = {
  outputDir: path.resolve("output"),
  sessionsDir: path.resolve("sessions"),
  configPaths: ["config.json", "harvester.config.json", "config.yaml"],
};

// ── DiagnosticsService ──

export class DiagnosticsService {
  private logger: ConsoleLogger;
  private options: typeof DEFAULT_DIAGNOSTICS_OPTIONS;

  constructor(logger?: ConsoleLogger, options?: Partial<typeof DEFAULT_DIAGNOSTICS_OPTIONS>) {
    this.logger = logger ?? new ConsoleLogger("info");
    this.options = { ...DEFAULT_DIAGNOSTICS_OPTIONS, ...options };
  }

  /** 运行全量诊断。 */
  async runFullDiagnostics(): Promise<DiagnosticsReport> {
    const [systemHealth, outputInfo, sessionInfo, configInfo] = await Promise.all([
      this.checkSystemHealth(),
      this.checkOutputDir(),
      this.checkSessions(),
      this.checkConfig(),
    ]);

    return {
      timestamp: new Date().toISOString(),
      systemHealth,
      outputDir: outputInfo,
      sessions: sessionInfo,
      config: configInfo,
    };
  }

  /** 检查系统组件健康状态。 */
  async checkSystemHealth(): Promise<SystemHealth> {
    const components: SystemHealth["components"] = [];

    // 1. ChromeService / CDP
    const chromeHealth = getChromeServiceHealth();
    if (!chromeHealth) {
      components.push({
        name: "ChromeService (CDP)",
        status: FeatureFlags.enableChromeService ? "warn" : "ok",
        detail: FeatureFlags.enableChromeService
          ? "ChromeService 已启用但未连接（CDP 9222 无响应）"
          : "ChromeService 未启用（FeatureFlag）",
      });
    } else {
      components.push({
        name: "ChromeService (CDP)",
        status: chromeHealth.status === "ready" ? "ok" : chromeHealth.degraded ? "warn" : "error",
        detail: `端口 ${chromeHealth.port}, 运行 ${Math.floor(chromeHealth.uptime / 1000)}s, 重启 ${chromeHealth.restartCount} 次`,
      });
    }

    // 2. 文件系统可写性
    try {
      const testPath = path.resolve(this.options.sessionsDir);
      fs.accessSync(testPath, fs.constants.W_OK);
      components.push({ name: "文件系统写入", status: "ok", detail: `${testPath} 可写入` });
    } catch {
      components.push({ name: "文件系统写入", status: "warn", detail: "sessions/ 目录不可写入，检查权限" });
    }

    // 3. 环境变量检查
    const varChecks: Array<{ name: string; required: boolean; value?: string }> = [
      { name: "WH_LOG_LEVEL", required: false, value: process.env.WH_LOG_LEVEL },
      { name: "VAULTKIT_PASSWORD", required: false, value: process.env.VAULTKIT_PASSWORD ? "(已设置)" : undefined },
    ];
    for (const vc of varChecks) {
      if (vc.value) {
        components.push({ name: `环境变量 ${vc.name}`, status: "ok", detail: `已设置: ${vc.value}` });
      } else if (vc.required) {
        components.push({ name: `环境变量 ${vc.name}`, status: "warn", detail: "未设置" });
      }
    }

    // 汇总状态
    const hasError = components.some((c) => c.status === "error");
    const hasWarn = components.some((c) => c.status === "warn");
    const overall = hasError ? "unhealthy" : hasWarn ? "degraded" : "healthy";

    return { status: overall, components };
  }

  private async checkOutputDir(): Promise<{ exists: boolean; fileCount: number; sizeMb: number }> {
    try {
      const dir = this.options.outputDir;
      if (!fs.existsSync(dir)) return { exists: false, fileCount: 0, sizeMb: 0 };
      let fileCount = 0;
      let totalBytes = 0;
      const walk = (d: string): void => {
        for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
          const full = path.join(d, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (entry.isFile()) {
            fileCount++;
            try { totalBytes += fs.statSync(full).size; } catch {} // ok: ignored
          }
        }
      };
      walk(dir);
      return { exists: true, fileCount, sizeMb: Math.round(totalBytes / (1024 * 1024) * 100) / 100 };
    } catch {
      return { exists: false, fileCount: 0, sizeMb: 0 };
    }
  }

  private async checkSessions(): Promise<{ exists: boolean; count: number }> {
    try {
      const dir = this.options.sessionsDir;
      if (!fs.existsSync(dir)) return { exists: false, count: 0 };
      const files = fs.readdirSync(dir).filter(
        (f) => f.endsWith(".session.json") || f.endsWith(".json"),
      );
      return { exists: true, count: files.length };
    } catch {
      return { exists: false, count: 0 };
    }
  }

  private async checkConfig(): Promise<{ exists: boolean; path: string }> {
    for (const cfgPath of this.options.configPaths) {
      const full = path.resolve(cfgPath);
      if (fs.existsSync(full)) return { exists: true, path: full };
    }
    return { exists: false, path: this.options.configPaths[0] };
  }
}
