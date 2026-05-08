/**
 * MCP Server CLI 入口。
 * 通过 `mcp` 命令启动：node dist/mcp/cli.js
 */
import { ConsoleLogger } from "../adapters/ConsoleLogger";
import { FileSessionManager } from "../adapters/FileSessionManager";
import { startMcpServer } from "./server";

const logger = new ConsoleLogger("info");
const sessionManager = new FileSessionManager();

logger.info("启动 WebHarvester MCP Server...");
startMcpServer({ logger, sessionManager });
