import http from "http";
import { Router } from "../Router";
import { ServerContext } from "./context";
import { AuthGuard } from "../../utils/auth-guard";
import { CookieSyncService } from "../../services/cookie-sync-service";

export function registerSessionRoutes(router: Router, ctx: ServerContext): void {
  router.register("POST", "/api/login", (req, res) => handleApiLogin(req, res, ctx));
  router.register("POST", "/api/login/qrcode", (req, res) => handleApiQrcode(req, res, ctx));
  router.register("POST", "/api/login/qrcode/confirm", (req, res) => handleApiQrcodeConfirm(req, res, ctx));
  router.register("POST", "/api/login/qrcode/cleanup", (req, res) => handleApiQrcodeCleanup(req, res, ctx));
  router.register("GET", "/api/profiles", (req, res) => handleApiProfiles(req, res, ctx));
  router.register("GET", "/api/sessions", (req, res) => handleApiSessions(req, res, ctx));
  router.register("DELETE", "/api/sessions/:name", (req, res, p) => handleApiDeleteSession(req, res, ctx, p));
  router.register("POST", "/api/sessions/validate", (req, res) => handleApiValidateSession(req, res, ctx));
  router.register("POST", "/api/sessions/sync-from-browser", (req, res) => handleApiSyncFromBrowser(req, res));
}

async function handleApiLogin(req: http.IncomingMessage, res: http.ServerResponse, ctx: ServerContext): Promise<void> {
  const body = await ctx.getBody(req);
  const { profile, loginUrl, verifyUrl } = JSON.parse(body);

  const authGuard = new AuthGuard(ctx.sessionManager);
  const session = await authGuard.ensureAuth(profile, loginUrl, verifyUrl);

  res.writeHead(200, { "Content-Type": "application/json" });
  if (session) {
    res.end(JSON.stringify({ code: 0, msg: "登录成功", profile }));
  } else {
    res.end(JSON.stringify({ code: -1, msg: "登录失败或超时" }));
  }
}

async function handleApiQrcode(req: http.IncomingMessage, res: http.ServerResponse, ctx: ServerContext): Promise<void> {
  const body = JSON.parse(await ctx.getBody(req));
  const { profile, loginUrl, autoSave } = body;
  if (!profile || !loginUrl) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: -1, msg: "缺少 profile 或 loginUrl" }));
    return;
  }
  try {
    const { BrowserLifecycleManager } = await import("../../adapters/BrowserLifecycleManager");
    const lcm = new BrowserLifecycleManager(ctx.logger);
    const page = await lcm.launch(loginUrl, false, undefined, "domcontentloaded", 300000);
    await page.waitForLoadState("load", { timeout: 15000 }).catch(() => {});

    await page.evaluate(() => {
      const keywords = ["登录", "登入", "log in", "sign in"];
      const allEls = document.querySelectorAll<HTMLElement>("a, button, div, span, li");
      for (const el of allEls) {
        if (el.offsetWidth === 0 || el.offsetHeight === 0) continue;
        const text = el.textContent?.trim().toLowerCase() || "";
        if (keywords.some((k) => text === k)) { el.click(); return; }
      }
    });
    await page.waitForTimeout(2000);

    if (autoSave) {
      const authKw = ["session", "token", "sid", "sess", "passport"];
      const deadline = Date.now() + 300000;
      let loggedIn = false;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1500));
        try {
          const cookies = await page.context().cookies();
          if (cookies.some((c) => authKw.some((w) => c.name.toLowerCase().includes(w)))) { loggedIn = true; break; }
          const currentUrl = page.url().split("?")[0];
          if (currentUrl !== loginUrl.split("?")[0]) {
            for (let i = 0; i < 10; i++) {
              await new Promise((r) => setTimeout(r, 500));
              const cookies2 = await page.context().cookies();
              if (cookies2.some((c) => authKw.some((w) => c.name.toLowerCase().includes(w)))) { loggedIn = true; break; }
            }
            if (loggedIn) break;
          }
        } catch {}
      }
      if (!loggedIn) { await lcm.close(); res.writeHead(408); res.end(JSON.stringify({ code: -1, msg: "扫码登录超时" })); return; }

      const { captureSessionFromPage } = await import("../../utils/session-helper");
      const sessionData = await captureSessionFromPage(page, page.context());
      await ctx.sessionManager.save(profile, sessionData);
      await lcm.close();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: 0, msg: `会话已保存为 [${profile}]` }));
    } else {
      ctx.sessionContext = { lcm, page, profile, loginUrl };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: 0, data: { profile, loginUrl, sessionId: profile } }));
    }
  } catch (e: any) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: -1, msg: e.message }));
  }
}

async function handleApiQrcodeConfirm(req: http.IncomingMessage, res: http.ServerResponse, ctx: ServerContext): Promise<void> {
  const body = JSON.parse(await ctx.getBody(req));
  const { profile, save: doSave, sessionData: existingData } = body;

  if (doSave && existingData) {
    try {
      await ctx.sessionManager.save(profile, existingData);
      if (ctx.sessionContext?.profile === profile) ctx.sessionContext = null;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: 0, msg: `会话已保存为 [${profile}]` }));
    } catch (e: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: -1, msg: e.message }));
    }
    return;
  }

  if (!profile || !ctx.sessionContext || ctx.sessionContext.profile !== profile) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: -1, msg: "未找到登录会话，请重新扫码" }));
    return;
  }
  try {
    const { captureSessionFromPage } = await import("../../utils/session-helper");
    const { page, loginUrl } = ctx.sessionContext;

    const cookies = await page.context().cookies();
    const hasAuth = cookies.some((c: { name: string }) => ["session", "token", "sid", "sess", "passport"].some((w) => c.name.toLowerCase().includes(w)));
    if (!hasAuth) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: -1, msg: "未检测到登录态，请确认已完成扫码登录" }));
      return;
    }

    const sessionData = await captureSessionFromPage(page, page.context());
    let userName = "";
    try {
      userName = await page.evaluate(() => {
        const el = document.querySelector<HTMLElement>(".user-name, .header-user-name, [class*=username]");
        return el?.textContent?.trim() || document.title?.split("-")[0]?.trim() || "";
      });
    } catch {}

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      code: 0,
      data: {
        profile,
        sessionData,
        userInfo: { name: userName, domain: new URL(loginUrl).hostname },
      },
    }));
  } catch (e: any) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: -1, msg: e.message }));
  }
}

async function handleApiQrcodeCleanup(req: http.IncomingMessage, res: http.ServerResponse, ctx: ServerContext): Promise<void> {
  if (ctx.sessionContext) {
    try { await ctx.sessionContext.page.context().close(); } catch (err) { ctx.logger.warn("QR cleanup page close failed", { err: (err as Error).message }); }
    try { (ctx.sessionContext.lcm as any).close(); } catch (err) { ctx.logger.warn("QR cleanup lcm close failed", { err: (err as Error).message }); }
    ctx.sessionContext = null;
  }
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ code: 0, msg: "已清理" }));
}

async function handleApiProfiles(req: http.IncomingMessage, res: http.ServerResponse, ctx: ServerContext): Promise<void> {
  const profiles = await ctx.sessionManager.listProfiles();
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ code: 0, data: profiles }));
}

async function handleApiSessions(req: http.IncomingMessage, res: http.ServerResponse, ctx: ServerContext): Promise<void> {
  const profiles = await ctx.sessionManager.listProfiles();
  const data = await Promise.all(profiles.map(async (name) => {
    const state = await ctx.sessionManager.load(name);
    if (!state) return { name, status: "error", cookies: 0, createdAt: null };
    const ageHours = (Date.now() - state.createdAt) / 3600000;
    return { name, status: ageHours > 336 ? "expired" : "valid", cookies: state.cookies.length, createdAt: state.createdAt };
  }));
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ code: 0, data }));
}

async function handleApiDeleteSession(req: http.IncomingMessage, res: http.ServerResponse, ctx: ServerContext, params?: Record<string, string>): Promise<void> {
  const name = params?.name || req.url!.replace("/api/sessions/", "").split("?")[0];
  await ctx.sessionManager.deleteProfile(name);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ code: 0, msg: `已删除会话 ${name}` }));
}

async function handleApiValidateSession(req: http.IncomingMessage, res: http.ServerResponse, ctx: ServerContext): Promise<void> {
  const body = await ctx.getBody(req);
  let profile = "";
  try { profile = JSON.parse(body).profile; } catch {}
  if (!profile) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: -1, msg: "缺少 profile 参数" }));
    return;
  }
  try {
    const result = await ctx.sessionManager.validateSession(profile);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: result.valid ? 0 : -1, data: result }));
  } catch (e: any) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: -1, msg: e.message }));
  }
}

async function handleApiSyncFromBrowser(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  try {
    const svc = new CookieSyncService();
    const synced = await svc.syncFromCDPToSessions();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: 0, data: { synced, count: synced.length } }));
  } catch (e: any) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: -1, msg: e.message }));
  }
}
