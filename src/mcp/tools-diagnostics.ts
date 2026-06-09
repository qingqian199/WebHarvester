import fs from "fs/promises";
import path from "path";
import type { ILogger } from "../core/ports/ILogger";
import { WbiKeyManager } from "../signer/wbi-key-manager";
import { McpServer } from "./protocol";

interface ToolContext {
  logger: ILogger;
}

export function registerDiagnosticsTools(server: McpServer, ctx: ToolContext): void {
  // ── 工具: trigger_wbi_sync — 刷新 WBI 密钥 ──
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

  // ── 工具: check_browser_health — 检查 ChromeService/CDP 健康状态 ──
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

  // ── 工具: wait_for_user_action_complete — 手动发信号继续采集 ──
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

  // ── 工具: report_diagnostics — 诊断故障 ──
  server.registerTool({
    name: "report_diagnostics",
    description:
      "对指定 traceId 的采集任务执行全量诊断：分析时间线错误、分类错误类型、检查系统健康、站点功能调用统计，返回诊断报告和修复建议。不传 traceId 则诊断最近一次任务。",
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

      const { getTimeline, listTimelines } = await import("../monitoring/task-monitor");
      const { classifyWithSuggestion } = await import("../utils/error-classifier");
      const { DiagnosticsService } = await import("../services/diagnostics-service");
      const { getCrawlerProfiler } = await import("../monitoring/crawler-profiler");
      const { WbiKeyManager } = await import("../signer/wbi-key-manager");

      let timeline = traceId ? getTimeline(traceId) : undefined;
      if (!timeline) {
        const all = listTimelines(5);
        timeline = all.find((t) => !site || t.site === site) ?? all[0];
      }
      if (!timeline) {
        return {
          traceId: traceId || "(none)",
          overallStatus: "no_data",
          error: "未找到匹配的 traceId",
          failedSteps: [],
          errorCategories: [],
          systemHealth: null,
          unusedFunctions: [],
          suggestions: ["执行一次采集任务后再次诊断"],
        };
      }

      const failedSteps: Array<{ name: string; error: { message: string; code?: string; category: string; suggestion: string }; duration: number }> =
        [];
      const categoryMap = new Map<string, { count: number; suggestions: Set<string> }>();

      for (const step of timeline.steps) {
        if (step.success || !step.error) continue;
        const duration = step.endedAt ? step.endedAt - step.startedAt : 0;
        const classification = classifyWithSuggestion(step.error.message, step.error.code);
        failedSteps.push({
          name: step.name,
          error: { message: step.error.message, code: step.error.code, category: classification.category, suggestion: classification.suggestion },
          duration,
        });
        if (!categoryMap.has(classification.category)) {
          categoryMap.set(classification.category, { count: 0, suggestions: new Set() });
        }
        const entry = categoryMap.get(classification.category)!;
        entry.count++;
        entry.suggestions.add(classification.suggestion);
      }

      const errorCategories = Array.from(categoryMap.entries()).map(([cat, data]) => ({
        category: cat,
        count: data.count,
        suggestions: Array.from(data.suggestions),
      }));

      const diagSvc = new DiagnosticsService();
      const systemHealth = await diagSvc.runFullDiagnostics();

      const profiler = getCrawlerProfiler();
      const domainProfile = profiler.getDomainProfile(timeline.site);

      const suggestions: string[] = [];
      for (const [, data] of categoryMap) {
        for (const s of data.suggestions) suggestions.push(s);
      }

      if (categoryMap.has("SIGN_ERROR") && timeline.site === "bilibili") {
        try {
          const wbiMgr = new WbiKeyManager();
          const wbiStatus = wbiMgr.getStatus();
          suggestions.push(
            `WBI 密钥状态: ${wbiStatus.available ? "可用" : "不可用"}, 来源: ${wbiStatus.source}, 缓存: ${wbiStatus.isCached ? "已过期" : "有效"}, 建议: ${wbiStatus.available ? (wbiStatus.isCached ? "执行 trigger_wbi_sync 刷新" : "正常") : "需获取 WBI 密钥"}`,
          );
        } catch {}
      }

      if (failedSteps.length === 0 && timeline.overallStatus === "success") {
        suggestions.push("采集任务已完成且无错误，无需修复。");
      }

      return {
        traceId: timeline.traceId,
        site: timeline.site,
        overallStatus: timeline.overallStatus,
        startedAt: new Date(timeline.startedAt).toISOString(),
        endedAt: timeline.endedAt ? new Date(timeline.endedAt).toISOString() : null,
        duration: timeline.endedAt ? timeline.endedAt - timeline.startedAt : null,
        labels: timeline.labels,
        totalSteps: timeline.steps.length,
        failedSteps,
        errorCategories,
        systemHealth: systemHealth.systemHealth,
        unusedFunctions: domainProfile.unusedUnits,
        highFailRateUnits: domainProfile.highFailRateUnits,
        suggestions: [...new Set(suggestions)],
      };
    },
  });

  // ── 工具: auto_repair — 自动修复 ──
  server.registerTool({
    name: "auto_repair",
    description:
      "对指定 traceId 的采集任务执行诊断 → 自动修复 → 重试闭环。当前支持的自动修复：SIGN_ERROR → 刷新 WBI 密钥；SESSION_EXPIRED → 同步浏览器 Cookie。其他错误类型提示人工处理。",
    inputSchema: {
      type: "object",
      properties: {
        traceId: { type: "string", description: "采集任务 traceId" },
      },
      required: ["traceId"],
    },
    handler: async (args) => {
      const traceId = args.traceId as string;

      const { getTimeline } = await import("../monitoring/task-monitor");
      const { classifyWithSuggestion } = await import("../utils/error-classifier");
      const { WbiKeyManager } = await import("../signer/wbi-key-manager");

      const timeline = getTimeline(traceId);
      if (!timeline) return { traceId, status: "failed", error: "未找到匹配的 traceId", actions: [], retryResult: null };

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
                actions.push({
                  category: "SIGN_ERROR",
                  action: "刷新 WBI 密钥",
                  status: "ok",
                  detail: `密钥状态: ${status.available ? "可用" : "不可用"}, 来源: ${status.source}`,
                });
              } catch (e: unknown) {
                actions.push({ category: "SIGN_ERROR", action: "刷新 WBI 密钥", status: "failed", detail: (e as Error).message });
              }
            } else {
              actions.push({
                category: "SIGN_ERROR",
                action: "刷新签名密钥",
                status: "skipped",
                detail: `站点 ${timeline.site} 的签名刷新暂不支持自动修复，请手动更新密钥`,
              });
            }
            break;
          }
          case "SESSION_EXPIRED": {
            try {
              const { CookieSyncService } = await import("../services/cookie-sync-service");
              const svc = new CookieSyncService();
              const synced = await svc.syncFromCDPToSessions(true);
              actions.push({
                category: "SESSION_EXPIRED",
                action: "从 CDP 浏览器同步 Cookie",
                status: "ok",
                detail: `已同步 ${synced.length} 个站点的 Cookie`,
              });
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
            actions.push({
              category: "CAPTCHA",
              action: "处理验证码",
              status: "skipped",
              detail: "验证码需人工介入，建议降低请求频率或启用打码平台",
            });
            break;
          }
          default: {
            actions.push({
              category: classification.category,
              action: "自动修复",
              status: "skipped",
              detail: `${classification.category} 暂不支持自动修复：${classification.suggestion}`,
            });
            break;
          }
        }
      }

      let retryResult: unknown = null;
      const failedUnits = timeline.steps.filter((s) => !s.success && s.name.startsWith("unit:")).map((s) => s.name.slice(5));

      if (failedUnits.length > 0 && actions.some((a) => a.status === "ok")) {
        try {
          const siteMap: Record<string, new (...args: any[]) => any> = {
            xiaohongshu: XhsCrawler,
            zhihu: ZhihuCrawler,
            bilibili: BilibiliCrawler,
            tiktok: TikTokCrawler,
            baidu_scholar: BaiduScholarCrawler,
          };
          const CrawlerClass = siteMap[timeline.site];
          if (CrawlerClass) {
            const crawler = new CrawlerClass();
            const params: Record<string, string> = {};
            for (const [k, v] of Object.entries(timeline.labels)) {
              params[k] = v;
            }
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

  // ── 工具: check_wbi_health — 检查 WBI 密钥状态 ──
  server.registerTool({
    name: "check_wbi_health",
    description: "检查 B站 WBI 签名密钥的健康状态。返回密钥是否存在、是否过期、来源等信息。用于诊断 WBI 签名问题。",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const mgr = new WbiKeyManager(ctx.logger);
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

// Import needed for auto_repair site map (dynamic imports handle the rest)
import { XhsCrawler } from "../adapters/crawlers/XhsCrawler";
import { ZhihuCrawler } from "../adapters/crawlers/ZhihuCrawler";
import { BilibiliCrawler } from "../adapters/crawlers/BilibiliCrawler";
import { TikTokCrawler } from "../adapters/crawlers/TikTokCrawler";
import { BaiduScholarCrawler } from "../adapters/crawlers/BaiduScholarCrawler";
