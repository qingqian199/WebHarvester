import http from "http";
import { ConsoleLogger } from "../../adapters/ConsoleLogger";
import { FileSessionManager } from "../../adapters/FileSessionManager";
import { ITaskQueue } from "../../core/ports/ITaskQueue";

export interface ServerContext {
  logger: ConsoleLogger;
  sessionManager: FileSessionManager;
  getTaskQueue: () => ITaskQueue | null;
  jwtSecret: string;
  loginAttempts: Map<string, { count: number; lockUntil: number }>;
  sessionContext: { lcm: any; page: any; profile: string; loginUrl: string } | null;
  getClientIp: (req: http.IncomingMessage) => string;
  getBody: (req: http.IncomingMessage) => Promise<string>;
}
