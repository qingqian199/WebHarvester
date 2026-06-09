/**
 * MCP 客户端管理 — 连接/断开 Playwright MCP 服务器
 *
 * 通过 stdio JSON-RPC 直接通信（不依赖 @modelcontextprotocol/sdk 的具体版本）
 */
import { spawn, ChildProcess } from "child_process";
import { createInterface } from "readline";

interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** MCP JSON-RPC 响应中 content 项的格式 */
export interface McpContentItem {
  type: string;
  text?: string;
}

/** MCP 工具调用的标准响应格式 */
export interface McpResponse {
  content?: McpContentItem[];
  isError?: boolean;
  _meta?: Record<string, unknown>;
}

let proc: ChildProcess | null = null;
let rl: ReturnType<typeof createInterface> | null = null;
let msgId = 0;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
let toolsCache: McpToolDefinition[] | null = null;

/** 启动 Playwright MCP 进程并等待就绪 */
export async function startMcp(headless = true): Promise<void> {
  if (proc) return;

  return new Promise((resolve, reject) => {
    const args = headless ? ["--headless"] : [];
    proc = spawn("npx", ["@playwright/mcp@latest", ...args], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, PATH: process.env.PATH || "" },
    });

    const timeout = setTimeout(() => reject(new Error("MCP 启动超时")), 20000);

    rl = createInterface({ input: proc.stdout!, terminal: false });
    rl.on("line", (line) => {
      try {
        const msg = JSON.parse(line);
        if (msg.id && pending.has(msg.id)) {
          const p = pending.get(msg.id)!;
          pending.delete(msg.id);
          if (msg.error) p.reject(new Error(msg.error.message));
          else p.resolve(msg.result);
        }
        // 初始化完成信号：tools/list 响应
        if (msg.result?.tools) {
          toolsCache = msg.result.tools;
          clearTimeout(timeout);
          resolve();
        }
      } catch {}
    });

    proc.stderr?.on("data", (d: Buffer) => {
      const txt = d.toString().trim();
      if (txt && !txt.includes("Playwright MCP server")) console.error("[MCP]", txt);
    });
    proc.on("error", (e) => {
      clearTimeout(timeout);
      reject(e);
    });
    proc.on("exit", () => {
      proc = null;
      rl = null;
    });

    // 发送初始化请求
    setTimeout(() => sendRequest("tools/list", {}).catch(() => {}), 2000);
  });
}

/** 发送 JSON-RPC 请求 */
export function sendRequest(method: string, params: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!proc?.stdin) return reject(new Error("MCP 未连接"));
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
}

/** 调用 MCP 工具 */
export async function callTool(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
  return sendRequest("tools/call", { name, arguments: args });
}

/** 调用 MCP 工具并返回类型化响应 */
export async function callToolTyped(name: string, args: Record<string, unknown> = {}): Promise<McpResponse> {
  const result = await sendRequest("tools/call", { name, arguments: args });
  return result as McpResponse;
}

/** 从 McpResponse 中提取首个 text content */
export function getMcpText(response: McpResponse): string {
  return response.content?.[0]?.text || "";
}

/** 获取可用工具列表 */
export async function listTools(): Promise<McpToolDefinition[]> {
  if (toolsCache) return toolsCache;
  const result = await sendRequest("tools/list", {});
  const resp = result as { tools?: McpToolDefinition[] };
  toolsCache = resp.tools ?? null;
  return toolsCache ?? [];
}

/** 断开 MCP 连接 */
export function stopMcp(): void {
  if (proc) {
    proc.kill();
    proc = null;
    rl = null;
  }
  pending.clear();
  toolsCache = null;
}
