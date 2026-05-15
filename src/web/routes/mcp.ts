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
    {
      name: "validate_session",
      description: "验证指定登录态是否有效",
      inputSchema: { type: "object", properties: { profile: { type: "string" } } },
    },
    {
      name: "check_login_status",
      description: "验证指定站点的登录态是否有效",
      inputSchema: { type: "object", properties: { domain: { type: "string" }, accountId: { type: "string" } }, required: ["domain"] },
    },
    {
      name: "update_session",
      description: "通过 Cookie 字符串更新站点登录态",
      inputSchema: { type: "object", properties: { domain: { type: "string" }, cookieString: { type: "string" }, accountId: { type: "string" } }, required: ["domain", "cookieString"] },
    },
    {
      name: "trigger_wbi_sync",
      description: "强制刷新 B站 WBI 签名密钥",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "search_papers",
      description: "搜索百度学术论文",
      inputSchema: { type: "object", properties: { keyword: { type: "string" }, limit: { type: "number" } }, required: ["keyword"] },
    },
    {
      name: "run_crawl_task",
      description: "手动触发采集任务",
      inputSchema: { type: "object", properties: { site: { type: "string" }, units: { type: "array", items: { type: "string" } }, params: { type: "object" }, sessionName: { type: "string" } }, required: ["site", "units"] },
    },
    {
      name: "sync_sessions_from_browser",
      description: "从 CDP 浏览器同步 Cookie 到本地会话",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "check_browser_health",
      description: "检查 ChromeService/CDP 连接健康状态",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "wait_for_user_action_complete",
      description: "告知爬虫用户已完成手动操作，继续采集",
      inputSchema: { type: "object", properties: { traceId: { type: "string" } } },
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
    const { SqliteStorageAdapter } = await import("../../storage/sqlite-storage-adapter");
    const { CompositeStorageAdapter } = await import("../../storage/composite-storage-adapter");
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
    const storage = new CompositeStorageAdapter([
      new FileStorageAdapter(appCfg.outputDir),
      new SqliteStorageAdapter(),
    ]);
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
  validate_session: async (args) => {
    const profile = args.profile as string | undefined;
    if (profile) {
      const result = await httpSessionManager.validateSession(profile);
      return result;
    }
    const profiles = await httpSessionManager.listProfiles();
    const results = [];
    for (const p of profiles) {
      const r = await httpSessionManager.validateSession(p);
      results.push({ profile: p, ...r });
    }
    return results;
  },
  check_login_status: async (args) => {
    const domain = args.domain as string;
    const accountId = args.accountId as string | undefined;
    const profile = accountId ? `${domain}:${accountId}` : domain;
    const result = await httpSessionManager.validateSession(profile);
    return { domain, accountId: accountId || "main", ...result };
  },
  update_session: async (args) => {
    const domain = args.domain as string;
    const cookieString = args.cookieString as string;
    const accountId = (args.accountId as string) || "main";
    const profile = `${domain}:${accountId}`;
    const cookies = cookieString.split(";").filter(Boolean).map((pair) => {
      const eq = pair.indexOf("=");
      if (eq === -1) return null;
      return { name: pair.slice(0, eq).trim(), value: pair.slice(eq + 1).trim(), domain: `.${domain}.com`, path: "/", secure: false, httpOnly: false };
    }).filter(Boolean) as any[];
    if (cookies.length === 0) return { status: "error", message: "无法解析 Cookie" };
    const existing = await httpSessionManager.load(profile);
    const state = existing || { cookies, localStorage: {}, sessionStorage: {}, createdAt: Date.now(), lastUsedAt: Date.now() };
    state.cookies = cookies;
    state.lastUsedAt = Date.now();
    await httpSessionManager.save(profile, state);
    return { status: "ok", profile, cookieCount: cookies.length };
  },
  trigger_wbi_sync: async () => {
    const { WbiKeyManager } = await import("../../signer/wbi-key-manager");
    const mgr = new WbiKeyManager(httpLogger);
    const before = await mgr.getKeys();
    await mgr.refresh();
    const after = await mgr.getKeys();
    return { status: "ok", before: { img_key: before.img_key.slice(0, 12) + "..." }, after: { img_key: after.img_key.slice(0, 12) + "..." }, expiresIn: "30 分钟" };
  },
  search_papers: async (args) => {
    const { BaiduScholarCrawler } = await import("../../adapters/crawlers/BaiduScholarCrawler");
    const keyword = args.keyword as string;
    const limit = Math.min((args.limit as number) || 10, 50);
    const crawler = new BaiduScholarCrawler();
    const result = await crawler.collectUnits(["scholar_search"], { keyword, max_pages: String(Math.ceil(limit / 10)) });
    const searchResult = result[0];
    const papers = (searchResult?.data as any)?.data?.papers || [];
    return { status: searchResult?.status || "failed", keyword, total: papers.length, papers: papers.slice(0, limit).map((p: any) => ({ title: p.标题, authors: p.作者, year: p.发表年份, abstract: (p.摘要 || "").slice(0, 300), doi: p.DOI, paperId: p._paperId })) };
  },
  run_crawl_task: async (args) => {
    const site = args.site as string;
    const units = args.units as string[];
    const params = (args.params || {}) as Record<string, string>;
    const sessionName = args.sessionName as string | undefined;
    const siteMap: Record<string, any> = { xiaohongshu: null, zhihu: null, bilibili: null, tiktok: null, baidu_scholar: null };
    const { XhsCrawler } = await import("../../adapters/crawlers/XhsCrawler"); siteMap.xiaohongshu = XhsCrawler;
    const { ZhihuCrawler } = await import("../../adapters/crawlers/ZhihuCrawler"); siteMap.zhihu = ZhihuCrawler;
    const { BilibiliCrawler } = await import("../../adapters/crawlers/BilibiliCrawler"); siteMap.bilibili = BilibiliCrawler;
    const { BaiduScholarCrawler } = await import("../../adapters/crawlers/BaiduScholarCrawler"); siteMap.baidu_scholar = BaiduScholarCrawler;
    const CrawlerClass = siteMap[site];
    if (!CrawlerClass) throw new Error(`未知站点: ${site}`);
    const crawler = new CrawlerClass();
    let session: any;
    if (sessionName) {
      const state = await httpSessionManager.load(sessionName);
      if (state) session = { cookies: state.cookies, localStorage: state.localStorage };
    }
    const traceId = `mcp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const results = await crawler.collectUnits(units, params, session);
    return { traceId, site, units, results };
  },
  sync_sessions_from_browser: async () => {
    const { CookieSyncService } = await import("../../services/cookie-sync-service");
    const svc = new CookieSyncService();
    const synced = await svc.syncFromCDPToSessions();
    return { status: "ok", synced, count: synced.length };
  },
  check_browser_health: async () => {
    const { getChromeServiceHealth, getChromeServiceStatus } = await import("../../utils/chrome-service-bridge");
    const health = getChromeServiceHealth();
    const status = getChromeServiceStatus();
    if (!health) return { status: "stopped", message: "ChromeService 未启动" };
    return { status, port: health.port, uptime: Math.floor(health.uptime / 1000) + "s", degraded: health.degraded, restartCount: health.restartCount };
  },
  wait_for_user_action_complete: async () => {
    return { status: "ok", message: "信号已接收，采集将继续" };
  },
};
