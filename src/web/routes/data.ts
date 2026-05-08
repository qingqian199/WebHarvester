import http from "http";
import fs from "fs/promises";
import path from "path";
import { Router } from "../Router";
import { ServerContext } from "./context";
import { exportResultsToXlsx } from "../../utils/exporter/xlsx-exporter";
import { formatUnitResult, formatUnitResults } from "../../utils/formatter";
import { ResultAnalyzer } from "../../utils/analyzer";
import { ArticleCaptureService } from "../../services/ArticleCaptureService";
import { validateUrl } from "../../utils/url-validator";
import { XHS_CONTENT_UNITS, ZHIHU_CONTENT_UNITS, BILI_CONTENT_UNITS, TT_CONTENT_UNITS, BOSS_CONTENT_UNITS } from "../../core/models/ContentUnit";
import { HarvestResult } from "../../core/models";

export function registerDataRoutes(router: Router, ctx: ServerContext): void {
  router.register("POST", "/api/analyze", (req, res) => handleApiAnalyze(req, res, ctx));
  router.register("POST", "/api/quick-article", (req, res) => handleApiQuickArticle(req, res, ctx));
  router.register("POST", "/api/export-xlsx", (req, res) => handleApiExportXlsx(req, res, ctx));
  router.register("POST", "/api/format", (req, res) => handleApiFormat(req, res, ctx));
  router.register("GET", "/api/results", (req, res) => handleApiResults(res));
  router.register("GET", "/api/results/:filename", (req, res, p) => handleApiResultDetail(req, res, ctx, p));
  router.register("GET", "/api/content-units", async (req, res) => handleApiContentUnits(req, res));
}

async function handleApiAnalyze(req: http.IncomingMessage, res: http.ServerResponse, ctx: ServerContext): Promise<void> {
  const body = await ctx.getBody(req);
  const { filePath } = JSON.parse(body);

  const raw = await fs.readFile(filePath, "utf-8");
  const result: HarvestResult = JSON.parse(raw);
  const summary = ResultAnalyzer.summarize(result);
  const html = ResultAnalyzer.generateHtmlReport(summary, result);

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

async function handleApiQuickArticle(req: http.IncomingMessage, res: http.ServerResponse, ctx: ServerContext): Promise<void> {
  const body = await ctx.getBody(req);
  const { url } = JSON.parse(body);
  if (!url) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: -1, msg: "缺少 url 参数" }));
    return;
  }
  try {
    validateUrl(url);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: -1, msg: "URL 不合法：禁止访问内网地址" }));
    return;
  }
  const service = new ArticleCaptureService(ctx.logger);
  const result = await service.capture(url);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ code: 0, data: result }));
}

async function handleApiExportXlsx(req: http.IncomingMessage, res: http.ServerResponse, ctx: ServerContext): Promise<void> {
  const body = JSON.parse(await ctx.getBody(req));
  const { results } = body;
  if (!results || !Array.isArray(results)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: -1, msg: "需要 results[]" }));
    return;
  }
  try {
    const buf = exportResultsToXlsx(results);
    res.writeHead(200, {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=harvest.xlsx",
    });
    res.end(buf);
  } catch (e: any) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: -1, msg: e.message }));
  }
}

async function handleApiFormat(req: http.IncomingMessage, res: http.ServerResponse, ctx: ServerContext): Promise<void> {
  const body = JSON.parse(await ctx.getBody(req));
  const { units, results } = body;
  if (units && Array.isArray(units)) {
    const formatted = units.map((u: any) => formatUnitResult(u.unit || u.id, u.data));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: 0, data: formatted }));
  } else if (results && Array.isArray(results)) {
    const text = formatUnitResults(results);
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(text);
  } else {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: -1, msg: "需要 units[] 或 results[]" }));
  }
}

async function handleApiResults(res: http.ServerResponse): Promise<void> {
  const outputDir = path.resolve("output");
  const entries: Array<{ filename: string; url: string; timestamp: string; size: number }> = [];
  try {
    const dirs = await fs.readdir(outputDir, { withFileTypes: true });
    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;
      const files = await fs.readdir(path.join(outputDir, dir.name));
      for (const f of files) {
        if (!f.endsWith(".json")) continue;
        const fullPath = path.join(outputDir, dir.name, f);
        const stat = await fs.stat(fullPath);
        let url = "";
        try {
          const content = await fs.readFile(fullPath, "utf-8");
          const parsed = JSON.parse(content);
          url = parsed.targetUrl ?? parsed.url ?? "";
        } catch {}
        entries.push({ filename: `${dir.name}/${f}`, url, timestamp: stat.mtime.toISOString(), size: stat.size });
      }
    }
  } catch {}
  entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ code: 0, data: entries }));
}

async function handleApiResultDetail(req: http.IncomingMessage, res: http.ServerResponse, ctx: ServerContext, params?: Record<string, string>): Promise<void> {
  const rawName = decodeURIComponent(params?.filename || req.url!.replace("/api/results/", ""));
  const safeName = path.normalize(rawName).replace(/^(\.\.(\/|\\))+/, "");
  const fullPath = path.resolve("output", safeName);
  if (!fullPath.startsWith(path.resolve("output"))) {
    res.writeHead(403); res.end(JSON.stringify({ code: -1, msg: "路径穿越拦截" })); return;
  }
  try {
    const content = await fs.readFile(fullPath, "utf-8");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: 0, data: JSON.parse(content) }));
  } catch {
    res.writeHead(404); res.end(JSON.stringify({ code: -1, msg: "文件不存在" }));
  }
}

function handleApiContentUnits(req: http.IncomingMessage, res: http.ServerResponse): void {
  const site = new URL(req.url!, `http://${req.headers.host}`).searchParams.get("site") || "";
  const map: Record<string, readonly typeof XHS_CONTENT_UNITS[0][]> = {
    xiaohongshu: XHS_CONTENT_UNITS,
    zhihu: ZHIHU_CONTENT_UNITS,
    bilibili: BILI_CONTENT_UNITS,
    tiktok: TT_CONTENT_UNITS,
    boss_zhipin: BOSS_CONTENT_UNITS,
  };
  const units = map[site] ?? [];
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ code: 0, data: units }));
}
