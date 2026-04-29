import { ILogger } from "../core/ports/ILogger";
import { LogMeta } from "../utils/logger/JsonLogger";

export class ConsoleLogger implements ILogger {
  private readonly level: "debug" | "info" | "warn" | "error";

  constructor(level?: string) {
    const envLevel = (level || process.env.LOG_LEVEL || "info").toLowerCase();
    const validLevels = ["debug", "info", "warn", "error"];
    this.level = validLevels.includes(envLevel)
      ? (envLevel as "debug" | "info" | "warn" | "error")
      : "info";
  }

  private shouldLog(level: string): boolean {
    const order: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3 };
    return order[level] >= order[this.level];
  }

  private format(level: string, message: string, meta?: LogMeta): string {
    const time = new Date().toISOString();
    const metaStr = meta ? ` | ${JSON.stringify(meta)}` : "";
    return `[${time}] [${level.toUpperCase()}] ${message}${metaStr}`;
  }

  debug(message: string, meta?: LogMeta): void {
    if (this.shouldLog("debug")) console.debug(this.format("debug", message, meta));
  }
  info(message: string, meta?: LogMeta): void {
    if (this.shouldLog("info")) console.log(this.format("info", message, meta));
  }
  warn(message: string, meta?: LogMeta): void {
    if (this.shouldLog("warn")) console.warn(this.format("warn", message, meta));
  }
  error(message: string, meta?: LogMeta): void {
    if (this.shouldLog("error")) console.error(this.format("error", message, meta));
  }
}
