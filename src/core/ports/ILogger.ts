/** 结构化日志端口。所有业务日志应通过此接口输出，携带 traceId 便于追踪。 */
export interface ILogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  /** 设置当前请求的 traceId，后续日志自动附加。 */
  setTraceId?(traceId: string): void;
  /** 设置当前模块名，后续日志自动附加。 */
  setModule?(name: string): void;
}
