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
            } catch {} // ok: ignored
            entries.push({ filename: `${dir.name}/${f}`, url: url.slice(0, 120), timestamp: stat.mtime.toISOString(), size: stat.size });
          }
        }
      } catch {} // ok: ignored
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

  // ── 工具 15: report_diagnostics — 诊断故障 ──
  server.registerTool({
    name: "report_diagnostics",
    description: "对指定 traceId 的采集任务执行全量诊断：分析时间线错误、分类错误类型、检查系统健康、站点功能调用统计，返回诊断报告和修复建议。不传 traceId 则诊断最近一次任务。",
    inputSchema: {
      type: "object",
      properties: {
        traceId: { type: "string", description: "采集任务 traceId（可选，默认最近一次）" },
        site: { type: "string", description: "站点过滤（可选）" },
      },
    },
    handler: async (args) => {
      const traceId = args.traceId as string | undefined;
      const site = args.site as string | undefined;

      const { getTimeline, listTimelines } = await import("../monitoring/task-monitor.js");
      const { classifyWithSuggestion } = await import("../utils/error-classifier.js");
      const { DiagnosticsService } = await import("../services/diagnostics-service.js");
      const { getCrawlerProfiler } = await import("../monitoring/crawler-profiler.js");
      const { WbiKeyManager } = await import("../signer/wbi-key-manager.js");

      // 1. 获取时间线
      let timeline = traceId ? getTimeline(traceId) : undefined;
      if (!timeline) {
        const all = listTimelines(5);
        timeline = all.find((t) => !site || t.site === site) ?? all[0];
      }
      if (!timeline) {
        return { traceId: traceId || "(none)", overallStatus: "no_data", error: "未找到匹配的 traceId", failedSteps: [], errorCategories: [], systemHealth: null, unusedFunctions: [], suggestions: ["执行一次采集任务后再次诊断"] };
      }

      // 2. 分类时间线中的错误
      const failedSteps: Array<{ name: string; error: { message: string; code?: string; category: string; suggestion: string }; duration: number }> = [];
      const categoryMap = new Map<string, { count: number; suggestions: Set<string> }>();

      for (const step of timeline.steps) {
        if (step.success || !step.error) continue;
        const duration = step.endedAt ? step.endedAt - step.startedAt : 0;
        const classification = classifyWithSuggestion(step.error.message, step.error.code);
        failedSteps.push({ name: step.name, error: { message: step.error.message, code: step.error.code, category: classification.category, suggestion: classification.suggestion }, duration });
        if (!categoryMap.has(classification.category)) { categoryMap.set(classification.category, { count: 0, suggestions: new Set() }); }
        const entry = categoryMap.get(classification.category)!;
        entry.count++; entry.suggestions.add(classification.suggestion);
      }

      const errorCategories = Array.from(categoryMap.entries()).map(([cat, data]) => ({ category: cat, count: data.count, suggestions: Array.from(data.suggestions) }));

      // 3. 系统健康诊断
      const diagSvc = new DiagnosticsService();
      const systemHealth = await diagSvc.runFullDiagnostics();

      // 4. 站点功能调用统计
      const profiler = getCrawlerProfiler();
      const domainProfile = profiler.getDomainProfile(timeline.site);

      // 5. 全局建议
      const suggestions: string[] = [];
      for (const [, data] of categoryMap) { for (const s of data.suggestions) suggestions.push(s); }

      if (categoryMap.has("SIGN_ERROR") && timeline.site === "bilibili") {
        try {
          const wbiMgr = new WbiKeyManager();
          const wbiStatus = wbiMgr.getStatus();
          suggestions.push(`WBI 密钥状态: ${wbiStatus.available ? "可用" : "不可用"}, 来源: ${wbiStatus.source}, 缓存: ${wbiStatus.isCached ? "已过期" : "有效"}, 建议: ${wbiStatus.available ? (wbiStatus.isCached ? "执行 trigger_wbi_sync 刷新" : "正常") : "需获取 WBI 密钥"}`);
        } catch {}
      }

      if (failedSteps.length === 0 && timeline.overallStatus === "success") { suggestions.push("采集任务已完成且无错误，无需修复。"); }

      return { traceId: timeline.traceId, site: timeline.site, overallStatus: timeline.overallStatus, startedAt: new Date(timeline.startedAt).toISOString(), endedAt: timeline.endedAt ? new Date(timeline.endedAt).toISOString() : null, duration: timeline.endedAt ? timeline.endedAt - timeline.startedAt : null, labels: timeline.labels, totalSteps: timeline.steps.length, failedSteps, errorCategories, systemHealth: systemHealth.systemHealth, unusedFunctions: domainProfile.unusedUnits, highFailRateUnits: domainProfile.highFailRateUnits, suggestions: [...new Set(suggestions)] };
    },
  });

  // ── 工具 16: auto_repair — 自动修复 ──
  server.registerTool({
    name: "auto_repair",
    description: "对指定 traceId 的采集任务执行诊断 → 自动修复 → 重试闭环。当前支持的自动修复：SIGN_ERROR → 刷新 WBI 密钥；SESSION_EXPIRED → 同步浏览器 Cookie。其他错误类型提示人工处理。",
    inputSchema: {
      type: "object",
      properties: {
        traceId: { type: "string", description: "采集任务 traceId" },
      },
      required: ["traceId"],
    },
    handler: async (args) => {
      const traceId = args.traceId as string;

      const { getTimeline } = await import("../monitoring/task-monitor.js");
      const { classifyWithSuggestion } = await import("../utils/error-classifier.js");
      const { WbiKeyManager } = await import("../signer/wbi-key-manager.js");

      // 1. 获取时间线
      const timeline = getTimeline(traceId);
      if (!timeline) return { traceId, status: "failed", error: "未找到匹配的 traceId", actions: [], retryResult: null };

      // 2. 分析错误并执行修复
      const actions: Array<{ category: string; action: string; status: "ok" | "skipped" | "failed"; detail?: string }> = [];
      const categoriesSeen = new Set<string>();

      for (const step of timeline.steps) {
        if (step.success || !step.error) continue;
        const classification = classifyWithSuggestion(step.error.message, step.error.code);
        if (categoriesSeen.has(classification.category)) continue;
        categoriesSeen.add(classification.category);

        switch (classification.category) {
          case "SIGN_ERROR": {
            if (timeline.site === "bilibili") {
              try {
                const mgr = new WbiKeyManager();
                await mgr.refresh();
                const status = mgr.getStatus();
                actions.push({ category: "SIGN_ERROR", action: "刷新 WBI 密钥", status: "ok", detail: `密钥状态: ${status.available ? "可用" : "不可用"}, 来源: ${status.source}` });
              } catch (e: unknown) {
                actions.push({ category: "SIGN_ERROR", action: "刷新 WBI 密钥", status: "failed", detail: (e as Error).message });
              }
            } else {
              actions.push({ category: "SIGN_ERROR", action: "刷新签名密钥", status: "skipped", detail: `站点 ${timeline.site} 的签名刷新暂不支持自动修复，请手动更新密钥` });
            }
            break;
          }
          case "SESSION_EXPIRED": {
            try {
              const { CookieSyncService } = await import("../services/cookie-sync-service.js");
              const svc = new CookieSyncService();
              const synced = await svc.syncFromCDPToSessions(true);
              actions.push({ category: "SESSION_EXPIRED", action: "从 CDP 浏览器同步 Cookie", status: "ok", detail: `已同步 ${synced.length} 个站点的 Cookie` });
            } catch (e: unknown) {
              actions.push({ category: "SESSION_EXPIRED", action: "从 CDP 浏览器同步 Cookie", status: "failed", detail: (e as Error).message });
            }
            break;
          }
          case "RATE_LIMIT": {
            actions.push({ category: "RATE_LIMIT", action: "等待频率限制冷却", status: "skipped", detail: "请降低采集并发数或等待 1-5 分钟后重试" });
            break;
          }
          case "CAPTCHA": {
            actions.push({ category: "CAPTCHA", action: "处理验证码", status: "skipped", detail: "验证码需人工介入，建议降低请求频率或启用打码平台" });
            break;
          }
          default: {
            actions.push({ category: classification.category, action: "自动修复", status: "skipped", detail: `${classification.category} 暂不支持自动修复：${classification.suggestion}` });
            break;
          }
        }
      }

      // 3. 重试失败的采集单元
      let retryResult: unknown = null;
      const failedUnits = timeline.steps
        .filter((s) => !s.success && s.name.startsWith("unit:"))
        .map((s) => s.name.slice(5));

      if (failedUnits.length > 0 && actions.some((a) => a.status === "ok")) {
        try {
          const siteMap: Record<string, new (...args: any[]) => any> = { xiaohongshu: XhsCrawler, zhihu: ZhihuCrawler, bilibili: BilibiliCrawler, tiktok: TikTokCrawler, baidu_scholar: BaiduScholarCrawler };
          const CrawlerClass = siteMap[timeline.site];
          if (CrawlerClass) {
            const crawler = new CrawlerClass();
            const params: Record<string, string> = {};
            for (const [k, v] of Object.entries(timeline.labels)) { params[k] = v; }
            const retryResults = await crawler.collectUnits(failedUnits, params);
            retryResult = {
              site: timeline.site,
              units: failedUnits,
              successCount: retryResults.filter((r: any) => r.status === "success" || r.status === "partial").length,
              failCount: retryResults.filter((r: any) => r.status === "failed").length,
              details: retryResults.map((r: any) => ({ unit: r.unit, status: r.status, error: r.error })),
            };
          } else {
            retryResult = { error: `站点 ${timeline.site} 未注册` };
          }
        } catch (e: unknown) {
          retryResult = { error: (e as Error).message };
        }
      } else if (failedUnits.length > 0) {
        retryResult = { skipped: true, reason: "无成功的修复动作，跳过重试" };
      } else {
        retryResult = { skipped: true, reason: "没有失败的采集单元需要重试" };
      }

      return { traceId, status: actions.some((a) => a.status === "ok") ? "repaired" : "unrepaired", actions, retryResult };
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
      } catch {} // ok: ignored
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
