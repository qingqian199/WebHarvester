import { ConsoleLogger } from "../adapters/ConsoleLogger";
import { FileSessionManager } from "../adapters/FileSessionManager";
import { registerMcpTools } from "./tools";
import { McpServer } from "./protocol";

export interface McpConfig {
  logger?: ConsoleLogger;
  sessionManager?: FileSessionManager;
}

export function startMcpServer(config: McpConfig): McpServer {
  const logger = config.logger ?? new ConsoleLogger("info");
  const sessionManager = config.sessionManager ?? new FileSessionManager();

  const server = new McpServer({
    name: "webharvester-mcp",
    version: "1.0.0",
    logger,
  });

  registerMcpTools(server, { logger, sessionManager });

  // 启动 stdio 传输
  server.listen();
  logger.info("MCP Server 已启动 (stdio)");

  return server;
}
