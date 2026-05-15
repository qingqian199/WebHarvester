import fs from "fs/promises";
import path from "path";
import { ConsoleLogger } from "../adapters/ConsoleLogger";
import { XhsCrawler } from "../adapters/crawlers/XhsCrawler";
import { ZhihuCrawler } from "../adapters/crawlers/ZhihuCrawler";
import { BilibiliCrawler } from "../adapters/crawlers/BilibiliCrawler";
import { TikTokCrawler } from "../adapters/crawlers/TikTokCrawler";
import { BaiduScholarCrawler } from "../adapters/crawlers/BaiduScholarCrawler";
import { PlaywrightAdapter } from "../adapters/PlaywrightAdapter";
import { FileStorageAdapter } from "../adapters/FileStorageAdapter";
import { HarvesterService } from "../core/services/HarvesterService";
import { loadAppConfig } from "../utils/config-loader";
import { SqliteStorageAdapter } from "../storage/sqlite-storage-adapter";
import { CompositeStorageAdapter } from "../storage/composite-storage-adapter";
import { WbiKeyManager } from "../signer/wbi-key-manager";
import type { ISessionManager } from "../core/ports/ISessionManager";
import type { SessionData } from "../types/core.types";
import { McpServer } from "./protocol";

interface ToolContext {
  logger: ConsoleLogger;
  sessionManager: ISessionManager;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SITE_MAP: Record<string, new (...args: any[]) => any> = {
  xiaohongshu: XhsCrawler as any,
  zhihu: ZhihuCrawler as any,
  bilibili: BilibiliCrawler as any,
  tiktok: TikTokCrawler as any,
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
      const storage = new CompositeStorageAdapter([
        new FileStorageAdapter(appCfg.outputDir),
        new SqliteStorageAdapter(),
      ]);
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
      let session: SessionData | undefined;
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
      let session: SessionData | undefined;
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

  // ── 工具 6: check_login_status — 验证登录态 ──
  server.registerTool({
    name: "check_login_status",
    description: "验证指定站点的登录态是否有效。会发出实际的 HTTP 请求检测 Cookie 是否过期。支持 bilibili / xiaohongshu / zhihu。",
    inputSchema: {
      type: "object",
      properties: {
        domain: {
          type: "string",
          description: "站点域名标识，如 bilibili / xiaohongshu / zhihu",
        },
        accountId: {
          type: "string",
          description: "账号 ID（可选），不指定则检查该域名的默认账号",
        },
      },
      required: ["domain"],
    },
    handler: async (args) => {
      const domain = args.domain as string;
      const accountId = args.accountId as string | undefined;
      const profile = accountId ? `${domain}:${accountId}` : domain;
      const result = await ctx.sessionManager.validateSession(profile);
      return { domain, accountId: accountId || "main", ...result };
    },
  });

  // ── 工具 7: update_session — 更新 Cookie ──
  server.registerTool({
    name: "update_session",
    description: "通过完整的 Cookie 字符串更新指定站点的登录态。覆盖对应账号的 Cookie 文件，不清除其他字段。",
    inputSchema: {
      type: "object",
      properties: {
        domain: { type: "string", description: "站点域名标识，如 bilibili / xiaohongshu" },
        cookieString: { type: "string", description: "完整的 Cookie 字符串，如 'sid=abc; SESSDATA=def; ...'" },
        accountId: { type: "string", description: "账号 ID（可选），默认 main" },
        localStorage: {
          type: "object",
          description: "额外的 localStorage 键值对（可选）",
          additionalProperties: { type: "string" },
        },
      },
      required: ["domain", "cookieString"],
    },
    handler: async (args) => {
      const domain = args.domain as string;
      const cookieString = args.cookieString as string;
      const accountId = (args.accountId as string) || "main";
      const extraLS = (args.localStorage || {}) as Record<string, string>;
      const profile = `${domain}:${accountId}`;

      // 解析 Cookie 字符串
      const cookies = cookieString.split(";").filter(Boolean).map((pair) => {
        const eq = pair.indexOf("=");
        if (eq === -1) return null;
        const name = pair.slice(0, eq).trim();
        const value = pair.slice(eq + 1).trim();
        return { name, value, domain: `.${domain}.com`, path: "/" as const, secure: false, httpOnly: false };
      }).filter(Boolean) as Array<{ name: string; value: string; domain: string; path: string; secure: boolean; httpOnly: boolean }>;

      if (cookies.length === 0) {
        return { status: "error", message: "无法解析 Cookie 字符串" };
      }

      // 读取已有状态保留 non-cookie 字段
      const existing = await ctx.sessionManager.load(profile);
      const state = existing || {
        cookies,
        localStorage: { ...extraLS },
        sessionStorage: {},
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
      };

      state.cookies = cookies;
      state.lastUsedAt = Date.now();
      if (extraLS && Object.keys(extraLS).length > 0) {
        state.localStorage = { ...state.localStorage, ...extraLS };
      }

      await ctx.sessionManager.save(profile, state);
      return { status: "ok", profile, cookieCount: cookies.length };
    },
  });

  // ── 工具 8: trigger_wbi_sync — 刷新 WBI 密钥 ──
  server.registerTool({
    name: "trigger_wbi_sync",
    description: "强制刷新 B站 WBI 签名密钥。从 nav 接口获取最新的 img_key 和 sub_key，缓存到 sessions/wbi_keys.json。返回新旧密钥对比。",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const mgr = new WbiKeyManager(ctx.logger);
      const before = await mgr.getKeys();
      await mgr.refresh();
      const after = await mgr.getKeys();
      return {
        status: "ok",
        before: { img_key: before.img_key.slice(0, 12) + "...", sub_key: before.sub_key.slice(0, 12) + "..." },
        after: { img_key: after.img_key.slice(0, 12) + "...", sub_key: after.sub_key.slice(0, 12) + "..." },
        expiresIn: "30 分钟",
      };
    },
  });

  // ── 工具 9: search_papers — 搜索百度学术论文 ──
  server.registerTool({
    name: "search_papers",
    description: "搜索百度学术论文，返回结构化论文列表（标题、作者、摘要、年份、DOI 等）。每次最多返回 50 篇。",
    inputSchema: {
      type: "object",
      properties: {
        keyword: { type: "string", description: "搜索关键词" },
        limit: { type: "number", description: "返回数量（默认 10，最大 50）" },
      },
      required: ["keyword"],
    },
    handler: async (args) => {
      const keyword = args.keyword as string;
      const limit = Math.min((args.limit as number) || 10, 50);

      const crawler = new BaiduScholarCrawler();
      const result = await crawler.collectUnits(
        ["scholar_search"],
        { keyword, max_pages: String(Math.ceil(limit / 10)) },
      );

      const searchResult = result[0] as unknown as Record<string, unknown> | undefined;
      const searchData = searchResult?.data as Record<string, unknown> | undefined;
      const innerData = (searchData?.data ?? searchData) as Record<string, unknown> | undefined;
      const papers = (Array.isArray(innerData?.papers) ? innerData.papers : []) as Record<string, unknown>[];
      return {
        status: searchResult?.status || "failed",
        keyword,
        total: papers.length,
        papers: papers.slice(0, limit).map((p: Record<string, unknown>) => ({
          title: p.标题,
          authors: p.作者,
          year: p.发表年份,
          abstract: (String(p.摘要 || "")).slice(0, 300),
          keywords: p.关键词,
          doi: p.DOI,
          journal: p.期刊会议,
          citations: p.被引次数,
          paperId: p._paperId,
        })),
      };
    },
  });

  // ── 工具 10: run_crawl_task — 执行采集任务 ──
  server.registerTool({
    name: "run_crawl_task",
    description: "手动触发一个采集任务。指定站点和内容单元，返回 traceId 和采集结果。",
    inputSchema: {
      type: "object",
      properties: {
        site: {
          type: "string",
          description: "站点名: xiaohongshu, zhihu, bilibili, baidu_scholar",
          enum: ["xiaohongshu", "zhihu", "bilibili", "baidu_scholar"],
        },
        units: {
          type: "array",
          items: { type: "string" },
          description: "内容单元列表",
        },
        params: {
          type: "object",
          description: "采集参数",
          additionalProperties: { type: "string" },
        },
        sessionName: { type: "string", description: "登录态配置名（可选）" },
      },
      required: ["site", "units"],
    },
    handler: async (args) => {
      const site = args.site as string;
      const units = args.units as string[];
      const params = (args.params || {}) as Record<string, string>;
      const sessionName = args.sessionName as string | undefined;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const siteMap: Record<string, new (...args: any[]) => any> = {
        xiaohongshu: XhsCrawler,
        zhihu: ZhihuCrawler,
        bilibili: BilibiliCrawler,
        tiktok: TikTokCrawler,
        baidu_scholar: BaiduScholarCrawler,
      };

      const CrawlerClass = siteMap[site];
      if (!CrawlerClass) throw new Error(`未知站点: ${site}`);

      const crawler = new CrawlerClass();
      let session: SessionData | undefined;
      if (sessionName) {
        const state = await ctx.sessionManager.load(sessionName);
        if (state) session = { cookies: state.cookies, localStorage: state.localStorage };
      }

      const traceId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const startTime = Date.now();

      const results = await crawler.collectUnits(units, params, session);

      return {
        traceId,
        site,
        units,
        duration: Date.now() - startTime,
        results,
      };
    },
  });

  // ── 工具 11: sync_sessions_from_browser — 从 CDP 浏览器同步 Cookie ──
  server.registerTool({
    name: "sync_sessions_from_browser",
    description: "从 CDP 连接的 Chrome 浏览器中提取所有目标站点的 Cookie 并写入本地会话文件。支持站点：bilibili / xiaohongshu / zhihu / xueshu。merge=true 时以合并模式写入（保留已有 Cookie 中未出现在新数据中的条目，如小红书 a1）。",
    inputSchema: {
      type: "object",
      properties: {
        merge: {
          type: "boolean",
          description: "合并模式：保留已有 Cookie 中未出现在新同步中的条目（默认 true）",
        },
      },
    },
    handler: async (args: { merge?: boolean }) => {
      const { CookieSyncService } = await import("../services/cookie-sync-service");
      const svc = new CookieSyncService();
      const merge = args.merge !== false; // 默认 true
      const synced = await svc.syncFromCDPToSessions(merge);
      return { status: "ok", merge, synced, count: synced.length };
    },
  });

  // ── 工具 12: check_browser_health — 检查 ChromeService/CDP 健康状态 ──
  server.registerTool({
    name: "check_browser_health",
    description: "检查 ChromeService/CDP 连接健康状态。返回连接状态、运行时长、重启次数等信息。",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const { getChromeServiceHealth, getChromeServiceStatus } = await import("../utils/chrome-service-bridge");
      const health = getChromeServiceHealth();
      const status = getChromeServiceStatus();
      if (!health) {
        return { status: "stopped", message: "ChromeService 未启动或未连接" };
      }
      return {
        status,
        port: health.port,
        uptime: Math.floor(health.uptime / 1000) + "s",
        degraded: health.degraded,
        restartCount: health.restartCount,
        recommendation: health.degraded
          ? "⚠️ CDP 已降级，爬虫将使用 Playwright Stealth 模式。请检查 Chrome 安装和端口"
          : health.status === "ready"
            ? "✅ CDP 连接正常"
            : "⏳ ChromeService 正在启动",
      };
    },
  });

  // ── 工具 13: wait_for_user_action_complete — 手动发信号继续采集 ──
  server.registerTool({
    name: "wait_for_user_action_complete",
    description: "当爬虫等待用户手动操作（如验证码、扫码）时，用户完成操作后调用此工具告知系统继续。",
    inputSchema: {
      type: "object",
      properties: {
        traceId: { type: "string", description: "任务 traceId（可选）" },
      },
    },
    handler: async () => {
      return { status: "ok", message: "信号已发送，采集将自动继续" };
    },
  });

  // ── 工具 14: check_wbi_health — 检查 WBI 密钥状态 ──
  server.registerTool({
    name: "check_wbi_health",
    description: "检查 B站 WBI 签名密钥的健康状态。返回密钥是否存在、是否过期、来源等信息。用于诊断 WBI 签名问题。",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const mgr = new WbiKeyManager(ctx.logger);
      // 尝试从文件加载缓存（让 getStatus 有据可查）
      try {
        const raw = await fs.readFile(path.resolve("sessions/wbi_keys.json"), "utf-8");
        const fileCache = JSON.parse(raw);
        if (fileCache.img_key && fileCache.sub_key) {
          await mgr.setKeys(fileCache.img_key, fileCache.sub_key);
        }
      } catch {}
      const status = mgr.getStatus();
      return {
        status: status.available ? "ok" : "degraded",
        available: status.available,
        isCached: status.isCached,
        lastUpdated: status.lastUpdated ? new Date(status.lastUpdated).toISOString() : null,
        source: status.source,
        imgKeyPrefix: status.imgKeyPrefix,
        subKeyPrefix: status.subKeyPrefix,
        recommendation: status.available
          ? status.isCached
            ? "⚠️ 密钥已过期，建议执行 trigger_wbi_sync 刷新"
            : "✅ WBI 密钥正常"
          : "❌ 无可用 WBI 密钥，B站 API 签名请求将降级",
      };
    },
  });
}
