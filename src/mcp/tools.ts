import fs from "fs/promises";
import path from "path";
import { ConsoleLogger } from "../adapters/ConsoleLogger";
import { FileSessionManager } from "../adapters/FileSessionManager";
import { XhsCrawler } from "../adapters/crawlers/XhsCrawler";
import { ZhihuCrawler } from "../adapters/crawlers/ZhihuCrawler";
import { BilibiliCrawler } from "../adapters/crawlers/BilibiliCrawler";
import { TikTokCrawler } from "../adapters/crawlers/TikTokCrawler";
import { PlaywrightAdapter } from "../adapters/PlaywrightAdapter";
import { FileStorageAdapter } from "../adapters/FileStorageAdapter";
import { HarvesterService } from "../core/services/HarvesterService";
import { loadAppConfig } from "../utils/config-loader";
import { McpServer } from "./protocol";

interface ToolContext {
  logger: ConsoleLogger;
  sessionManager: FileSessionManager;
}

const SITE_MAP: Record<string, new () => any> = {
  xiaohongshu: XhsCrawler,
  zhihu: ZhihuCrawler,
  bilibili: BilibiliCrawler,
  tiktok: TikTokCrawler,
};

const SITE_UNITS: Record<string, string[]> = {
  xiaohongshu: ["user_info", "user_posts", "note_detail", "search_notes", "note_comments"],
  zhihu: ["zhihu_user_info", "zhihu_search", "zhihu_article", "zhihu_hot_search", "zhihu_comments"],
  bilibili: ["bili_video_info", "bili_search", "bili_user_videos", "bili_video_comments"],
  tiktok: ["tt_feed", "tt_video_detail", "tt_user_info", "tt_user_videos"],
};

export function registerMcpTools(server: McpServer, ctx: ToolContext): void {
  // ── 工具 1: harvest_url — 增强全量采集单个 URL ──
  server.registerTool({
    name: "harvest_url",
    description: "对单个 URL 执行增强全量采集，捕获所有网络请求、API 端点、反爬机制。返回 HAR 数据和采集报告。",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "目标 URL" },
        profile: { type: "string", description: "登录态配置名（可选）" },
      },
      required: ["url"],
    },
    handler: async (args) => {
      const url = args.url as string;
      const profile = args.profile as string | undefined;

      const appCfg = await loadAppConfig();
      let sessionState = null;
      if (profile) {
        const { AuthGuard } = await import("../utils/auth-guard");
        const authGuard = new AuthGuard(ctx.sessionManager);
        sessionState = await authGuard.ensureAuth(profile, url, url);
      }

      const browser = new PlaywrightAdapter(ctx.logger);
      const storage = new FileStorageAdapter(appCfg.outputDir);
      const svc = new HarvesterService(ctx.logger, browser, storage);
      await svc.harvest(
        { targetUrl: url, networkCapture: { captureAll: true, enhancedFullCapture: true } },
        "all", false, ctx.sessionManager, profile, sessionState ?? undefined,
      );
      return { status: "ok", message: "采集完成" };
    },
  });

  // ── 工具 2: collect_units — 运行内容单元采集 ──
  server.registerTool({
    name: "collect_units",
    description: "对指定站点运行内容单元采集（如视频信息、评论、搜索等）。返回结构化采集结果。支持站点：xiaohongshu, zhihu, bilibili, tiktok",
    inputSchema: {
      type: "object",
      properties: {
        site: {
          type: "string",
          description: "站点名: xiaohongshu, zhihu, bilibili, tiktok",
          enum: Object.keys(SITE_MAP),
        },
        units: {
          type: "array",
          items: { type: "string" },
          description: "内容单元列表。不传则使用默认单元。",
        },
        params: {
          type: "object",
          description: "采集参数（keyword / user_id / note_id / aid 等）",
        },
        sessionName: { type: "string", description: "登录态配置名（可选）" },
      },
      required: ["site"],
    },
    handler: async (args) => {
      const site = args.site as string;
      const units = (args.units as string[]) || SITE_UNITS[site] || [];
      const params = (args.params || {}) as Record<string, string>;
      const sessionName = args.sessionName as string | undefined;

      const CrawlerClass = SITE_MAP[site];
      if (!CrawlerClass) throw new Error(`未知站点: ${site}`);

      const crawler = new CrawlerClass();
      let session: any = undefined;
      if (sessionName) {
        const state = await ctx.sessionManager.load(sessionName);
        if (state) session = { cookies: state.cookies, localStorage: state.localStorage };
      }

      const results = await crawler.collectUnits(units, params, session);
      return { site, units, results };
    },
  });

  // ── 工具 3: search_and_collect — 搜索 + 采集一站式 ──
  server.registerTool({
    name: "search_and_collect",
    description: "搜索并采集指定站点的内容。例如搜索 B站 视频、小红书笔记、知乎文章等。返回搜索结果和详细数据。",
    inputSchema: {
      type: "object",
      properties: {
        site: {
          type: "string",
          description: "站点名: xiaohongshu, zhihu, bilibili",
          enum: ["xiaohongshu", "zhihu", "bilibili"],
        },
        keyword: { type: "string", description: "搜索关键词" },
        maxResults: { type: "number", description: "最大结果数（默认 3）" },
        sessionName: { type: "string", description: "登录态配置名（可选）" },
      },
      required: ["site", "keyword"],
    },
    handler: async (args) => {
      const site = args.site as string;
      const keyword = args.keyword as string;
      const sessionName = args.sessionName as string | undefined;

      const CrawlerClass = SITE_MAP[site];
      if (!CrawlerClass) throw new Error(`未知站点: ${site}`);

      const crawler = new CrawlerClass();
      let session: any = undefined;
      if (sessionName) {
        const state = await ctx.sessionManager.load(sessionName);
        if (state) session = { cookies: state.cookies, localStorage: state.localStorage };
      }

      // 搜索
      const searchUnit = site === "xiaohongshu" ? "search_notes"
        : site === "zhihu" ? "zhihu_search"
        : site === "bilibili" ? "bili_search"
        : "";
      if (!searchUnit) throw new Error(`站点 ${site} 不支持搜索`);

      const searchParams: Record<string, string> = { keyword, max_pages: "1" };
      if (site === "bilibili") searchParams.max_pages = "1";
      if (site === "xiaohongshu") searchParams.max_pages = "1";

      const results = await crawler.collectUnits([searchUnit], searchParams, session);
      return { site, keyword, results };
    },
  });

  // ── 工具 4: list_sessions — 列出所有登录态 ──
  server.registerTool({
    name: "list_sessions",
    description: "列出所有已保存的登录态配置。用于确认哪些站点已登录，避免采集时因未登录被限制。",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const profiles = await ctx.sessionManager.listProfiles();
      const sessions = await Promise.all(profiles.map(async (name) => {
        const state = await ctx.sessionManager.load(name);
        if (!state) return { name, status: "error" };
        const ageHours = (Date.now() - state.createdAt) / 3600000;
        return {
          name,
          status: ageHours > 336 ? "expired" : "valid",
          cookies: state.cookies.length,
          createdAt: new Date(state.createdAt).toISOString(),
          age: `${Math.round(ageHours)}h`,
        };
      }));
      return sessions;
    },
  });

  // ── 工具 5: get_results — 列出采集结果 ──
  server.registerTool({
    name: "get_results",
    description: "列出已有的采集结果文件。可按站点过滤。",
    inputSchema: {
      type: "object",
      properties: {
        site: { type: "string", description: "按站点目录过滤（可选），如 bilibili" },
        limit: { type: "number", description: "返回数量（默认 10）" },
      },
    },
    handler: async (args) => {
      const siteFilter = args.site as string | undefined;
      const limit = (args.limit as number) || 10;
      const outputDir = path.resolve("output");
      const entries: Array<{ filename: string; url: string; timestamp: string; size: number }> = [];

      try {
        const dirs = await fs.readdir(outputDir, { withFileTypes: true });
        for (const dir of dirs) {
          if (!dir.isDirectory()) continue;
          if (siteFilter && !dir.name.includes(siteFilter)) continue;
          const files = await fs.readdir(path.join(outputDir, dir.name));
          for (const f of files) {
            if (!f.endsWith(".json") || f.endsWith("-api.csv") || f.endsWith("-anti-crawl.json") || f.endsWith("-wbi-test.py") || f.endsWith("-wbi-stub.py")) continue;
            if (f.endsWith(".md")) continue;
            const fullPath = path.join(outputDir, dir.name, f);
            const stat = await fs.stat(fullPath);
            let url = "";
            try {
              const content = await fs.readFile(fullPath, "utf-8");
              const parsed = JSON.parse(content);
              url = parsed.targetUrl ?? parsed.url ?? "";
            } catch {}
            entries.push({ filename: `${dir.name}/${f}`, url: url.slice(0, 120), timestamp: stat.mtime.toISOString(), size: stat.size });
          }
        }
      } catch {}
      entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      return entries.slice(0, limit);
    },
  });
}
