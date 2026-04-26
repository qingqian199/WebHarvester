import dayjs from "dayjs";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogMeta {
  traceId?: string;
  [key: string]: unknown;
}

export interface StructLog {
  timestamp: string;
  level: LogLevel;
  message: string;
  meta?: LogMeta;
}

export class JsonLogger {
  private static format(level: LogLevel, message: string, meta?: LogMeta): string {
    const log: StructLog = {
      timestamp: dayjs().toISOString(),
      level,
      message,
      meta
    };
    return JSON.stringify(log);
  }

  debug(message: string, meta?: LogMeta): void {
    console.debug(JsonLogger.format("debug", message, meta));
  }
  info(message: string, meta?: LogMeta): void {
    console.info(JsonLogger.format("info", message, meta));
  }
  warn(message: string, meta?: LogMeta): void {
    console.warn(JsonLogger.format("warn", message, meta));
  }
  error(message: string, meta?: LogMeta): void {
    console.error(JsonLogger.format("error", message, meta));
  }
}
