import { ILogger } from "../core/ports/ILogger.js";
import { getTraceId } from "../utils/log-context.js";
import chalk from "chalk";

const LOG_ORDER: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3 };
export type LogFormat = "text" | "json";

function getFormat(): LogFormat {
  const env = process.env.WH_LOG_FORMAT;
  if (env === "json" || env === "text") return env;
  return "text";
}

function getGlobalLevel(): "debug" | "info" | "warn" | "error" {
  const env = process.env.WH_LOG_LEVEL || process.env.LOG_LEVEL || "info";
  const valid = ["debug", "info", "warn", "error"];
  return valid.includes(env.toLowerCase()) ? env.toLowerCase() as any : "info";
}

function getDebugModules(): Set<string> {
  const env = process.env.WH_LOG_DEBUG_MODULES || "";
  if (!env) return new Set();
  return new Set(env.split(",").map((s) => s.trim()).filter(Boolean));
}

export class ConsoleLogger implements ILogger {
  private level: "debug" | "info" | "warn" | "error";
  private instanceTraceId = "";
  private moduleName = "";
  private format: LogFormat;
  private moduleDebug = false;

  constructor(levelOrModule?: string) {
    const globalLevel = getGlobalLevel();
    const valid = ["debug", "info", "warn", "error"];
    if (levelOrModule && valid.includes(levelOrModule)) {
      this.level = levelOrModule as typeof this.level;
    } else {
      this.level = globalLevel;
      if (levelOrModule) this.moduleName = levelOrModule;
    }
    const activeDebugModules = getDebugModules();
    if (this.moduleName && activeDebugModules.has(this.moduleName)) {
      this.moduleDebug = true;
    }
    this.format = getFormat();
  }

  setTraceId(id: string): void { this.instanceTraceId = id; }
  setModule(name: string): void {
    this.moduleName = name;
    if (name && getDebugModules().has(name)) this.moduleDebug = true;
  }

  private resolvedTraceId(): string {
    return this.instanceTraceId || getTraceId() || "";
  }

  private shouldLog(level: string): boolean {
    const effectiveLevel = this.moduleDebug ? "debug" : this.level;
    return LOG_ORDER[level] >= LOG_ORDER[effectiveLevel];
  }

  private baseMeta(level: string, meta?: Record<string, unknown>): Record<string, unknown> {
    return {
      timestamp: new Date().toISOString(), level,
      ...(this.moduleName ? { module: this.moduleName } : {}),
      ...(this.resolvedTraceId() ? { traceId: this.resolvedTraceId() } : {}),
      ...meta, message: meta?.message || "",
    };
  }

  private output(level: string, message: string, meta?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return;
    const merged = { ...this.baseMeta(level, meta), message };
    if (this.format === "json") {
      const fn = level === "error" ? process.stderr : process.stdout;
      fn.write(JSON.stringify(merged) + "\n");
    } else {
      const colorMap: Record<string, chalk.Chalk> = { debug: chalk.gray, info: chalk.white, warn: chalk.yellow, error: chalk.red };
      const color = colorMap[level] || chalk.white;
      const metaStr = meta && Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : "";
      const fn = level === "error" ? console.error : level === "warn" ? console.warn : level === "debug" ? console.debug : console.log;
      fn(`${color(`[${level.toUpperCase()}]`)} ${this.moduleName ? chalk.magenta(`[${this.moduleName}]`) : ""} ${this.resolvedTraceId() ? chalk.gray(`[${this.resolvedTraceId()}]`) : ""} ${message}${metaStr}`);
    }
  }

  debug(message: string, meta?: Record<string, unknown>): void { this.output("debug", message, meta); }
  info(message: string, meta?: Record<string, unknown>): void { this.output("info", message, meta); }
  warn(message: string, meta?: Record<string, unknown>): void { this.output("warn", message, meta); }
  error(message: string, meta?: Record<string, unknown>): void { this.output("error", message, meta); }
}
