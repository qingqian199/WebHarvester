import type { ISessionManager } from "../core/ports/ISessionManager";
import { ConsoleLogger } from "../adapters/ConsoleLogger";
import { FileSessionManager } from "../adapters/FileSessionManager";
import { registerMcpTools } from "./tools";
import { McpServer } from "./protocol";

export interface McpConfig {
  logger?: ConsoleLogger;
  sessionManager?: ISessionManager;
}

let _instance: McpServer | null = null;

export function startMcpServer(config: McpConfig): McpServer {
  if (_instance) return _instance;

  const logger = config.logger ?? new ConsoleLogger("info");
  const sessionManager = config.sessionManager ?? new FileSessionManager();

  const server = new McpServer({
    name: "webharvester-mcp",
    version: "1.1.0",
    logger,
  });

  registerMcpTools(server, { logger, sessionManager });

  server.listen();
  logger.info("MCP Server 已启动 (stdio)");

  _instance = server;
  return server;
}

export function getMcpInstance(): McpServer | null {
  return _instance;
}

