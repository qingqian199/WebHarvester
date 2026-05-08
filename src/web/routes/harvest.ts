import http from "http";
import { Router } from "../Router";
import { ServerContext } from "./context";
import { loadAppConfig } from "../../utils/config-loader";
import { PlaywrightAdapter } from "../../adapters/PlaywrightAdapter";
import { FileStorageAdapter } from "../../adapters/FileStorageAdapter";
import { HarvesterService } from "../../core/services/HarvesterService";
import { BatchHarvestService } from "../../services/BatchHarvestService";
import { AuthGuard } from "../../utils/auth-guard";
import { loadBatchTasks } from "../../utils/batch-loader";
import { validateUrl } from "../../utils/url-validator";
import { HarvestTask } from "../../core/ports/ITaskQueue";
import { XhsCrawler } from "../../adapters/crawlers/XhsCrawler";
import { ZhihuCrawler } from "../../adapters/crawlers/ZhihuCrawler";
import { BilibiliCrawler } from "../../adapters/crawlers/BilibiliCrawler";
import { TikTokCrawler } from "../../adapters/crawlers/TikTokCrawler";

export function registerHarvestRoutes(router: Router, ctx: ServerContext): void {
  router.register("POST", "/api/run", (req, res) => handleApiRun(req, res, ctx));
  router.register("GET", "/api/batch", (req, res) => handleApiBatch(req, res, ctx));
  router.register("POST", "/api/collect-units", (req, res) => handleApiCollectUnits(req, res, ctx));
  router.register("POST", "/api/task", (req, res) => handleApiTaskSubmit(req, res, ctx));
  router.register("GET", "/api/task/:taskId", (req, res, p) => handleApiTaskStatus(req, res, ctx, p));
  router.register("GET", "/api/tasks/stream", (req, res) => handleApiTasksStream(req, res, ctx));
}

async function handleApiRun(req: http.IncomingMessage, res: http.ServerResponse, ctx: ServerContext): Promise<void> {
  const body = await ctx.getBody(req);
  const { url, profile, enhanced } = JSON.parse(body);
  try {
    validateUrl(url);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: -1, msg: "URL 不合法：禁止访问内网地址" }));
    return;
  }
  const appCfg = await loadAppConfig();

  let sessionState = null;
  if (profile) {
    const authGuard = new AuthGuard(ctx.sessionManager);
    sessionState = await authGuard.ensureAuth(profile, url, url);
    if (!sessionState) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: -1, msg: "登录状态获取失败" }));
      return;
    }
  }

  const browser = new PlaywrightAdapter(ctx.logger);
  const storage = new FileStorageAdapter(appCfg.outputDir);
  const svc = new HarvesterService(ctx.logger, browser, storage);
  await svc.harvest(
    {
      targetUrl: url,
      networkCapture: { captureAll: true, enhancedFullCapture: enhanced === true },
    },
    "all",
    false,
    ctx.sessionManager,
    profile,
    sessionState ?? undefined
  );

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ code: 0, msg: "采集完成" }));
}

async function handleApiBatch(req: http.IncomingMessage, res: http.ServerResponse, ctx: ServerContext): Promise<void> {
  const { tasks, concurrency } = await loadBatchTasks();
  const appCfg = await loadAppConfig();
  const batch = new BatchHarvestService(ctx.logger, appCfg.outputDir, concurrency);
  await batch.runBatch(tasks);

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ code: 0, msg: "批量采集完成" }));
}

async function handleApiCollectUnits(req: http.IncomingMessage, res: http.ServerResponse, ctx: ServerContext): Promise<void> {
  const body = JSON.parse(await ctx.getBody(req));
  const { site, units, params: userParams, sessionName, authMode } = body;
  if (!site || !units?.length) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: -1, msg: "缺少 site 或 units" }));
    return;
  }
  if (userParams?.url) {
    try {
      validateUrl(userParams.url);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: -1, msg: "URL 不合法：禁止访问内网地址" }));
      return;
    }
  }

  let session: any = undefined;
  if (sessionName) {
    const state = await ctx.sessionManager.load(sessionName);
    if (state) session = { cookies: state.cookies, localStorage: state.localStorage };
  }

  const crawlerMap: Record<string, any> = {
    xiaohongshu: new XhsCrawler(),
    zhihu: new ZhihuCrawler(),
    bilibili: new BilibiliCrawler(),
    tiktok: new TikTokCrawler(),
  };
  const crawler = crawlerMap[site];
  if (!crawler) {
    res.writeHead(400); res.end(JSON.stringify({ code: -1, msg: `未知站点: ${site}` }));
    return;
  }

  try {
    const results = await crawler.collectUnits(units, userParams || {}, session, authMode);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: 0, data: results }));
  } catch (e: any) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: -1, msg: e.message }));
  }
}

async function handleApiTaskSubmit(req: http.IncomingMessage, res: http.ServerResponse, ctx: ServerContext): Promise<void> {
  const body = JSON.parse(await ctx.getBody(req));
  const { site, units, params, sessionName, authMode } = body;
  if (!site || !units?.length) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: -1, msg: "缺少 site 或 units" }));
    return;
  }
  if (params?.url) {
    try {
      validateUrl(params.url);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: -1, msg: "URL 不合法：禁止访问内网地址" }));
      return;
    }
  }
  const tq = ctx.getTaskQueue();
  if (!tq) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: -1, msg: "任务队列未启用" }));
    return;
  }
  const task: HarvestTask = {
    id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    site, units, params, sessionName, authMode,
    url: params?.url || "",
  };
  await tq.enqueue(task);
  res.writeHead(202, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ code: 0, data: { taskId: task.id, status: tq.getStatus() } }));
}

async function handleApiTaskStatus(
  req: http.IncomingMessage, res: http.ServerResponse, ctx: ServerContext, params?: Record<string, string>,
): Promise<void> {
  const taskId = params?.taskId || req.url!.replace("/api/task/", "").split("?")[0];
  const tq = ctx.getTaskQueue();
  if (!tq) {
    res.writeHead(503); res.end(JSON.stringify({ code: -1, msg: "任务队列未启用" }));
    return;
  }
  const result = tq.getResult(taskId);
  const error = tq.getError(taskId);
  const status = tq.getStatus();
  const isCompleted = result !== undefined || error !== undefined;
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    code: 0,
    data: {
      taskId,
      completed: isCompleted,
      result: result || null,
      error: error || null,
      queueStatus: status,
    },
  }));
}

async function handleApiTasksStream(req: http.IncomingMessage, res: http.ServerResponse, ctx: ServerContext): Promise<void> {
  const tq = ctx.getTaskQueue();
  if (!tq) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: -1, msg: "任务队列未启用" }));
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  const initial = tq.getStatus();
  res.write(`event: queue\ndata: ${JSON.stringify(initial)}\n\n`);

  const onQueueChanged = (data: unknown) => {
    res.write(`event: queue\ndata: ${JSON.stringify(data)}\n\n`);
  };
  const onTaskEvent = (eventType: string, data: unknown) => {
    res.write(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  const onTaskStarted = (data: unknown) => onTaskEvent("task", data);
  const onTaskCompleted = (data: unknown) => onTaskEvent("task", data);
  const onTaskFailed = (data: unknown) => onTaskEvent("task", data);

  const queue = tq as unknown as { on: (e: string, cb: (...args: unknown[]) => void) => void; off: (e: string, cb: (...args: unknown[]) => void) => void };
  queue.on("queue:changed", onQueueChanged);
  queue.on("task:started", onTaskStarted);
  queue.on("task:completed", onTaskCompleted);
  queue.on("task:failed", onTaskFailed);

  const heartbeat = setInterval(() => {
    res.write(":heartbeat\n\n");
  }, 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
    queue.off("queue:changed", onQueueChanged);
    queue.off("task:started", onTaskStarted);
    queue.off("task:completed", onTaskCompleted);
    queue.off("task:failed", onTaskFailed);
  });
}
