import http from "http";
import type { ILogger } from "../../core/ports/ILogger";
import { FileSessionManager } from "../../adapters/FileSessionManager";
import { ITaskQueue } from "../../core/ports/ITaskQueue";

export interface ServerContext {
  logger: ILogger;
  sessionManager: FileSessionManager;
  getTaskQueue: () => ITaskQueue | null;
  jwtSecret: string;
  loginAttempts: Map<string, { count: number; lockUntil: number }>;
  sessionContext: { lcm: any; page: any; profile: string; loginUrl: string } | null;
  getClientIp: (req: http.IncomingMessage) => string;
  getBody: (req: http.IncomingMessage) => Promise<string>;
}
