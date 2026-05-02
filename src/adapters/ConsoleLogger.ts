import { ILogger } from "../core/ports/ILogger";
import chalk from "chalk";

const LOG_ORDER: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function isDev(): boolean {
  return (process.env.NODE_ENV || "development") !== "production";
}

export class ConsoleLogger implements ILogger {
  private level: "debug" | "info" | "warn" | "error";
  private traceId = "";
  private moduleName = "";

  constructor(levelOrModule?: string) {
    const configLevel = process.env.LOG_LEVEL || "info";
    const valid = ["debug", "info", "warn", "error"];
    if (levelOrModule && valid.includes(levelOrModule)) {
      this.level = levelOrModule as typeof this.level;
    } else {
      this.level = valid.includes(configLevel.toLowerCase()) ? configLevel.toLowerCase() as typeof this.level : "info";
      if (levelOrModule) this.moduleName = levelOrModule;
    }
  }

  setTraceId(id: string): void { this.traceId = id; }
  setModule(name: string): void { this.moduleName = name; }

  private shouldLog(level: string): boolean {
    return LOG_ORDER[level] >= LOG_ORDER[this.level];
  }

  private baseMeta(level: string, meta?: Record<string, unknown>): Record<string, unknown> {
    return {
      timestamp: new Date().toISOString(),
      level,
      ...(this.moduleName ? { module: this.moduleName } : {}),
      ...(this.traceId ? { traceId: this.traceId } : {}),
      ...meta,
      message: meta?.message || "",
    };
  }

  private output(level: string, message: string, meta?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return;
    const merged = { ...this.baseMeta(level, meta), message };

    if (isDev()) {
      const colorMap: Record<string, chalk.Chalk> = {
        debug: chalk.gray,
        info: chalk.white,
        warn: chalk.yellow,
        error: chalk.red,
      };
      const color = colorMap[level] || chalk.white;
      const tag = level.toUpperCase();
      const mod = this.moduleName ? chalk.magenta(`[${this.moduleName}]`) : "";
      const tid = this.traceId ? chalk.gray(`[${this.traceId}]`) : "";
      const metaStr = meta && Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : "";
      const fn = level === "error" ? console.error : level === "warn" ? console.warn : level === "debug" ? console.debug : console.log;
      fn(`${color(`[${tag}]`)} ${mod} ${tid} ${message}${metaStr}`);
    } else {
      const fn = level === "error" ? process.stderr : process.stdout;
      fn.write(JSON.stringify(merged) + "\n");
    }
  }

  debug(message: string, meta?: Record<string, unknown>): void { this.output("debug", message, meta); }
  info(message: string, meta?: Record<string, unknown>): void { this.output("info", message, meta); }
  warn(message: string, meta?: Record<string, unknown>): void { this.output("warn", message, meta); }
  error(message: string, meta?: Record<string, unknown>): void { this.output("error", message, meta); }
}
