import readline from "readline";
import { ConsoleLogger } from "../adapters/ConsoleLogger";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

interface McpServerOptions {
  name: string;
  version: string;
  logger: ConsoleLogger;
}

/**
 * 轻量 MCP 协议服务器。
 * 实现 JSON-RPC 2.0 over stdio 传输，支持 tools/list 和 tools/call。
 */
export class McpServer {
  private readonly options: McpServerOptions;
  private readonly tools: Map<string, McpToolDefinition> = new Map();

  constructor(options: McpServerOptions) {
    this.options = options;
  }

  registerTool(tool: McpToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  /** 启动 stdio 传输。监听 stdin，输出到 stdout。 */
  listen(): void {
    const rl = readline.createInterface({ input: process.stdin, terminal: false });

    rl.on("line", async (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      let request: JsonRpcRequest;
      try {
        request = JSON.parse(trimmed);
      } catch {
        this.sendError(null, -32700, "Parse error");
        return;
      }

      try {
        await this.handleRequest(request);
      } catch (e) {
        this.sendError(request.id, -32603, (e as Error).message);
      }
    });

    // 初始化通知
    this.send({ jsonrpc: "2.0", id: null, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} } } });
  }

  private async handleRequest(request: JsonRpcRequest): Promise<void> {
    switch (request.method) {
      case "tools/list": {
        const toolList = Array.from(this.tools.values()).map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        }));
        this.sendResult(request.id, { tools: toolList });
        break;
      }

      case "tools/call": {
        const params = request.params || {};
        const name = params.name as string;
        const args = (params.arguments || {}) as Record<string, unknown>;

        const tool = this.tools.get(name);
        if (!tool) {
          this.sendError(request.id, -32602, `Unknown tool: ${name}`);
          return;
        }

        try {
          const result = await tool.handler(args);
          this.sendResult(request.id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
        } catch (e) {
          this.sendResult(request.id, { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true });
        }
        break;
      }

      default:
        this.sendError(request.id, -32601, `Method not found: ${request.method}`);
    }
  }

  private send(msg: JsonRpcResponse): void {
    process.stdout.write(JSON.stringify(msg) + "\n");
  }

  private sendResult(id: string | number | null, result: unknown): void {
    this.send({ jsonrpc: "2.0", id, result });
  }

  private sendError(id: string | number | null, code: number, message: string): void {
    this.send({ jsonrpc: "2.0", id, error: { code, message } });
  }
}
