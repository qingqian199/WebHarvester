import { Router } from "../Router";
import { ServerContext } from "./context";
import { McpServer } from "../../mcp/protocol";
import { registerMcpTools } from "../../mcp/tools";

/**
 * MCP HTTP 桥接路由。
 * 将 HTTP POST 请求转换为 MCP JSON-RPC 调用。
 * 用于调试和测试；生产环境建议使用 stdio 模式。
 */
export function registerMcpRoutes(router: Router, ctx: ServerContext): void {
  const mcpServer = new McpServer({ name: "webharvester-mcp-http", version: "1.0.0", logger: ctx.logger });
  registerMcpTools(mcpServer, { logger: ctx.logger, sessionManager: ctx.sessionManager });

  router.register("POST", "/api/mcp", async (req, res) => {
    const body = await ctx.getBody(req);
    let request: any;
    try {
      request = JSON.parse(body);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }));
      return;
    }

    // 使用 Promise 捕获异步响应
    const result = await handleMcpRequest(mcpServer, request);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
  });
}

async function handleMcpRequest(server: McpServer, request: any): Promise<any> {
  switch (request.method) {
    case "tools/list": {
      // 通过 registerMcpTools 注册的工具已经可以在 server 内部获取
      // 但我们无法直接访问私有 tools 字段，所以返回所有工具名称
      return { jsonrpc: "2.0", id: request.id, result: { tools: getMcpToolDefinitions() } };
    }
    case "tools/call": {
      const params = request.params || {};
      const name = params.name;
      const args = (params.arguments || {}) as Record<string, unknown>;
      try {
        const tool = mcpToolHandlers[name as string];
        if (!tool) throw new Error(`Unknown tool: ${name}`);
        const result = await tool(args);
        return { jsonrpc: "2.0", id: request.id, result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] } };
      } catch (e) {
        return { jsonrpc: "2.0", id: request.id, result: { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true } };
      }
    }
    default:
      return { jsonrpc: "2.0", id: request.id, error: { code: -32601, message: `Method not found: ${request.method}` } };
  }
}

// 工具定义（用于 HTTP 桥接模式）
interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

function getMcpToolDefinitions(): ToolDef[] {
  return [
    {
      name: "harvest_url",
      description: "对单个 URL 执行增强全量采集",
      inputSchema: { type: "object", properties: { url: { type: "string" }, profile: { type: "string" } }, required: ["url"] },
    },
    {
      name: "collect_units",
      description: "对指定站点运行内容单元采集",
      inputSchema: { type: "object", properties: { site: { type: "string" }, units: { type: "array", items: { type: "string" } }, params: { type: "object" }, sessionName: { type: "string" } }, required: ["site"] },
    },
    {
      name: "search_and_collect",
      description: "搜索并采集指定站点内容",
      inputSchema: { type: "object", properties: { site: { type: "string" }, keyword: { type: "string" }, sessionName: { type: "string" } }, required: ["site", "keyword"] },
    },
    {
      name: "list_sessions",
      description: "列出所有已保存的登录态",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_results",
      description: "列出采集结果文件",
      inputSchema: { type: "object", properties: { site: { type: "string" }, limit: { type: "number" } } },
    },
  ];
}

// 工具处理器（用于 HTTP 桥接模式，避免依赖 McpServer 内部实现）
import { FileSessionManager } from "../../adapters/FileSessionManager";
import { ConsoleLogger } from "../../adapters/ConsoleLogger";

const httpLogger = new ConsoleLogger("info");
const httpSessionManager = new FileSessionManager();

const mcpToolHandlers: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {
  harvest_url: async (args) => {
    const { loadAppConfig } = await import("../../utils/config-loader");
    const { PlaywrightAdapter } = await import("../../adapters/PlaywrightAdapter");
    const { FileStorageAdapter } = await import("../../adapters/FileStorageAdapter");
    const { HarvesterService } = await import("../../core/services/HarvesterService");
    const url = args.url as string;
    const profile = args.profile as string | undefined;
    const appCfg = await loadAppConfig();
    let sessionState = null;
    if (profile) {
      const { AuthGuard } = await import("../../utils/auth-guard");
      sessionState = await new AuthGuard(httpSessionManager).ensureAuth(profile, url, url);
    }
    const browser = new PlaywrightAdapter(httpLogger);
    const storage = new FileStorageAdapter(appCfg.outputDir);
    const svc = new HarvesterService(httpLogger, browser, storage);
    await svc.harvest({ targetUrl: url, networkCapture: { captureAll: true, enhancedFullCapture: true } }, "all", false, httpSessionManager, profile, sessionState ?? undefined);
    return { status: "ok" };
  },
  collect_units: async (args) => {
    const { XhsCrawler } = await import("../../adapters/crawlers/XhsCrawler");
    const { ZhihuCrawler } = await import("../../adapters/crawlers/ZhihuCrawler");
    const { BilibiliCrawler } = await import("../../adapters/crawlers/BilibiliCrawler");
    const { TikTokCrawler } = await import("../../adapters/crawlers/TikTokCrawler");
    const SITE_MAP: Record<string, new () => any> = { xiaohongshu: XhsCrawler, zhihu: ZhihuCrawler, bilibili: BilibiliCrawler, tiktok: TikTokCrawler };
    const site = args.site as string;
    const CrawlerClass = SITE_MAP[site];
    if (!CrawlerClass) throw new Error(`未知站点: ${site}`);
    const crawler = new CrawlerClass();
    const units = (args.units as string[]) || [];
    const params = (args.params || {}) as Record<string, string>;
    const sessionName = args.sessionName as string | undefined;
    let session: any;
    if (sessionName) {
      const state = await httpSessionManager.load(sessionName);
      if (state) session = { cookies: state.cookies, localStorage: state.localStorage };
    }
    return await crawler.collectUnits(units, params, session);
  },
  search_and_collect: async (args) => {
    const { XhsCrawler } = await import("../../adapters/crawlers/XhsCrawler");
    const { ZhihuCrawler } = await import("../../adapters/crawlers/ZhihuCrawler");
    const { BilibiliCrawler } = await import("../../adapters/crawlers/BilibiliCrawler");
    const SITE_MAP: Record<string, new () => any> = { xiaohongshu: XhsCrawler, zhihu: ZhihuCrawler, bilibili: BilibiliCrawler };
    const site = args.site as string;
    const keyword = args.keyword as string;
    const CrawlerClass = SITE_MAP[site];
    if (!CrawlerClass) throw new Error(`未知站点: ${site}`);
    const crawler = new CrawlerClass();
    const searchUnit = site === "xiaohongshu" ? "search_notes" : site === "zhihu" ? "zhihu_search" : "bili_search";
    return await crawler.collectUnits([searchUnit], { keyword, max_pages: "1" });
  },
  list_sessions: async () => {
    return (await httpSessionManager.listProfiles()).map((name) => ({ name }));
  },
  get_results: async (args) => {
    const fs = await import("fs/promises");
    const path = await import("path");
    const siteFilter = args.site as string | undefined;
    const limit = (args.limit as number) || 10;
    const outputDir = path.resolve("output");
    const entries: any[] = [];
    try {
      const dirs = await fs.readdir(outputDir, { withFileTypes: true });
      for (const dir of dirs) {
        if (!dir.isDirectory()) continue;
        if (siteFilter && !dir.name.includes(siteFilter)) continue;
        const files = await fs.readdir(path.join(outputDir, dir.name));
        for (const f of files) {
          if (!f.endsWith(".json") || f.includes("-api.csv") || f.includes("-anti-crawl.json")) continue;
          if (f.endsWith(".md")) continue;
          const stat = await fs.stat(path.join(outputDir, dir.name, f));
          entries.push({ filename: `${dir.name}/${f}`, size: stat.size, timestamp: stat.mtime.toISOString() });
        }
      }
    } catch {}
    entries.sort((a: any, b: any) => b.timestamp.localeCompare(a.timestamp));
    return entries.slice(0, limit);
  },
};
