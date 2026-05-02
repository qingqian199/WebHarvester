import { CrawlerSession, PageData, FetchOptions } from "../../core/ports/ISiteCrawler";
import { IProxyProvider } from "../../core/ports/IProxyProvider";
import { generateXsHeader } from "../../utils/crypto/xhs-signer";
import { safeExtractInitialState } from "../../utils/safe-serialize";
import { setupSignatureInjection } from "../../utils/crypto/xhs-sign-injector";
import { XhsContentUnit, UnitResult } from "../../core/models/ContentUnit";
import { resolveXiaohongshuUrl } from "../../utils/url-resolver";
import { buildBrowserHeaders } from "../../utils/browser-env";
import { BaseCrawler } from "./BaseCrawler";

const XHS_DOMAIN = "xiaohongshu.com";
const XHS_API_HOST = "edith.xiaohongshu.com";

/**
 * 小红书 API 端点定义（签名直连 — 已验证可用）。
 *
 * name   — 用于 CLI/Web 显示的端点名。
 * path   — API 路径。
 * params — 默认查询参数。
 */
/** 小红书 API 端点定义。 */
export interface XhsEndpointDef {
  name: string;
  path: string;
  /** HTTP 方法，默认 GET。 */
  method?: string;
  /** 查询参数字符串（GET），或 JSON 体格式 POST 时默认 body 的模板。用 {} 表示运行时填充。 */
  params?: string;
  /**
   * POST 时请求体模板 JSON。字段值中的 {} 在 fetchApi 时会被替换。
   */
  bodyTemplate?: Record<string, any>;
  /** 端点状态：verified / risk_ctrl / sig_pending */
  status?: "verified" | "risk_ctrl" | "sig_pending";
}

/** 兜底方案端点：通过浏览器引擎从 HTML __INITIAL_STATE__ 提取数据。 */
export interface XhsFallbackDef {
  name: string;
  /** 页面 URL 模板。{keyword}/{user_id}/{note_id} 会在 fetchApi 时替换。 */
  pageUrl: string;
  /** 页面上提取初始状态的 eval 脚本。 */
  extractScript: string;
  /** 从 __INITIAL_STATE__ 到目标数据的 JSON 路径，如 "note.noteDetailMap" */
  dataPath: string;
}

export const XhsFallbackEndpoints: ReadonlyArray<XhsFallbackDef> = [
  { name: "搜索笔记", pageUrl: "https://www.xiaohongshu.com/search_result?keyword={keyword}",
    extractScript: "__INITIAL_STATE__", dataPath: "search.notes" },
  { name: "用户主页", pageUrl: "https://www.xiaohongshu.com/user/profile/{user_id}",
    extractScript: "__INITIAL_STATE__", dataPath: "user.userInfo" },
  { name: "笔记详情", pageUrl: "https://www.xiaohongshu.com/explore/{note_id}",
    extractScript: "__INITIAL_STATE__", dataPath: "note.noteDetailMap" },
] as const;

export const XhsApiEndpoints: ReadonlyArray<XhsEndpointDef> = [
  // ── ✅ 已验证可用（签名通过，code=0/1000） ──
  { name: "用户信息", path: "/api/sns/web/v2/user/me", status: "verified" },
  { name: "搜索建议", path: "/api/sns/web/v1/search/recommend", params: "keyword=%E5%8E%9F%E7%A5%9E", status: "verified" },
  { name: "系统配置", path: "/api/sns/web/v1/system/config", status: "verified" },
  { name: "区域列表", path: "/api/sns/web/v1/zones", status: "verified" },
  { name: "未读消息", path: "/api/sns/web/unread_count", status: "verified" },

  // ── ⛔ 触发风控（签名有效但被限，code=300011） ──
  { name: "搜索笔记", path: "/api/sns/web/v1/search/notes", method: "POST",
    bodyTemplate: { keyword: "原神", page: 1, page_size: 20, search_id: "{search_id}", sort: "general", note_type: 0, ext_flags: [], image_formats: ["jpg", "webp", "avif"] },
    status: "risk_ctrl" },

  // ── 🔶 签名验证通过但 -1（需要浏览器级 SDK 注入的额外头）。使用 signature injection 经由浏览器调用可解决。──
  { name: "搜索一站式", path: "/api/sns/web/v1/search/onebox", method: "POST",
    bodyTemplate: { keyword: "原神", search_id: "{search_id}", biz_type: "web_search_user", request_id: "{request_id}" },
    status: "sig_pending" },
  { name: "搜索筛选", path: "/api/sns/web/v1/search/filter", params: "keyword=%E5%8E%9F%E7%A5%9E&search_id={search_id}", status: "sig_pending" },
  { name: "收藏列表", path: "/api/sns/web/v1/board/user", params: "num=15&page=1", status: "sig_pending" },

  // ── 评论 ──
  { name: "笔记评论", path: "/api/sns/web/v2/comment/page", params: "note_id={note_id}&cursor={cursor}&top_comment_id=&image_formats=jpg,webp,avif", status: "sig_pending" },
  { name: "笔记子回复", path: "/api/sns/web/v2/comment/sub/page", params: "note_id={note_id}&comment_id={rpid}&cursor={cursor}&image_formats=jpg,webp,avif", status: "sig_pending" },
] as const;

/**
 * 小红书（xiaohongshu.com）特化爬虫。
 *
 * API 请求使用 Phase 2 完整签名（XXTEA + MD5 + 自定义 Base64），
 * 非 API 请求使用 Phase 1 简化签名（兼容 HTML 页面）。
 */
export class XhsCrawler extends BaseCrawler {
  readonly name = "xiaohongshu";
  readonly domain = XHS_DOMAIN;

  constructor(proxyProvider?: IProxyProvider) { super("xiaohongshu", proxyProvider); }

  matches(url: string): boolean {
    try {
      return new URL(url).hostname.includes(XHS_DOMAIN);
    } catch {
      return false;
    }
  }

  async fetch(url: string, session?: CrawlerSession, options?: FetchOptions): Promise<PageData> {
    const cookies = session?.cookies ?? [];
    const cookieMap: Record<string, string> = {};
    for (const c of cookies) cookieMap[c.name] = c.value;
    const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const fp = this.fp.getFingerprint();

    const method = options?.method ?? "GET";
    const body = options?.body ?? "";

    const baseHeaders = buildBrowserHeaders(fp, "https://www.xiaohongshu.com/");
    const headers: Record<string, string> = {
      ...baseHeaders,
      ...(cookieStr ? { Cookie: cookieStr } : {}),
    };

    const parsed = new URL(url);
    const isApi = parsed.hostname === XHS_API_HOST;

    if (isApi) {
      const apiPath = parsed.pathname;
      const rawQuery = parsed.search.replace("?", "");
      const signData = method === "POST" ? body : decodeURIComponent(rawQuery);
      const xsHeaders = generateXsHeader(apiPath, signData, cookieMap);
      Object.assign(headers, xsHeaders, {
        "X-s-common": buildXsCommon(fp.userAgent, fp.platform),
        "x-api-version": "1.0",
        "x-request-id": `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      });
    } else {
      const xt = Date.now().toString();
      Object.assign(headers, {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "X-t": xt,
        "X-s": buildXsLegacy(xt),
        "X-s-common": buildXsCommon(fp.userAgent, fp.platform),
      });
    }

    await this.rateLimiter.throttle();
    const start = Date.now();
    const res = await fetch(url, { method, headers, ...(method === "POST" && body ? { body } : {}) });
    const responseTime = Date.now() - start;
    return { url: res.url, statusCode: res.status, body: await res.text(), headers: Object.fromEntries(res.headers), responseTime, capturedAt: new Date().toISOString() };
  }

  /**
   * 通过端点名称和参数执行 API 请求。
   * @param endpointName XhsApiEndpoints 中的 name。
   * @param params 查询参数字符串（如 "keyword=test"），不传则使用默认参数。
   * @param session 可选登录态。
   */
  /**
   * 执行 API 调用。
   * @param endpointName 端点名（XhsApiEndpoints 中的 name）。
   * @param params 请求参数。
   * @param session 可选登录态。
   * @param authMode 认证模式：'logged_in'（默认，使用完整 session）| 'guest'（仅保留设备标识）。
   */
  async fetchApi(
    endpointName: string,
    params?: Record<string, string>,
    session?: CrawlerSession,
    authMode: "logged_in" | "guest" = "logged_in",
  ): Promise<PageData> {
    const ep = XhsApiEndpoints.find((e) => e.name === endpointName);
    if (!ep) throw new Error(`未知端点: ${endpointName}`);

    // 游客态：只保留设备标识 Cookie，移除登录凭据
    let effectiveSession = session;
    if (authMode === "guest" && session) {
      const guestCookies = session.cookies.filter((c) =>
        ["a1", "buvid", "device", "webId"].some((k) => c.name.toLowerCase().includes(k)),
      );
      effectiveSession = { cookies: guestCookies, localStorage: session.localStorage };
    }

    // 自动补全：从 session 中提取 user_id（用于 board/user 等需要用户 ID 的端点）
    const mergedParams = { ...(ep.params ? Object.fromEntries(new URLSearchParams(ep.params)) : {}), ...params };
    if (!mergedParams.user_id && effectiveSession) {
      const fromCookie = effectiveSession.cookies.find((c) => ["user_id", "uid", "userId"].some((k) => c.name.toLowerCase().includes(k)));
      if (fromCookie) mergedParams.user_id = fromCookie.value;
      if (!mergedParams.user_id && effectiveSession.localStorage?.user_id) mergedParams.user_id = effectiveSession.localStorage.user_id;
      if (!mergedParams.user_id) {
        // 尝试从 localStorage 中的 userInfo 提取
        const ls = effectiveSession.localStorage || {};
        for (const v of Object.values(ls)) {
          try {
            const parsed = JSON.parse(v as string);
            if (parsed.user_id || parsed.uid) {
              mergedParams.user_id = String(parsed.user_id || parsed.uid);
              break;
            }
          } catch {}
        }
      }
    }

    const method = ep.method ?? "GET";

    if (method === "POST" && ep.bodyTemplate) {
      const body = this.fillTemplate(ep.bodyTemplate, params ?? {});
      const bodyStr = JSON.stringify(body);
      const url = `https://${XHS_API_HOST}${ep.path}`;
      return this.fetchWithRetry(url, effectiveSession, { method: "POST", body: bodyStr,
        contentType: "application/json;charset=UTF-8" });
    }

    const query = Object.entries(mergedParams).filter(([k]) => k !== "bodyTemplate").map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
    const url = `https://${XHS_API_HOST}${ep.path}${query ? "?" + query : ""}`;
    return this.fetchWithRetry(url, effectiveSession);
  }

  private fillTemplate(tpl: Record<string, any>, params: Record<string, string>): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(tpl)) {
      if (typeof v === "string" && v.startsWith("{") && v.endsWith("}")) {
        const key = v.slice(1, -1);
        // 自动生成 search_id / request_id 等 UUID 字段
        const autoGenerated = key.includes("search_id") || key.includes("request_id") || key.includes("uuid");
        result[k] = params[key] ?? (autoGenerated ? generateXhsId() : v);
      } else if (typeof v === "string" && params[k]) {
        result[k] = params[k];
      } else {
        result[k] = v;
      }
    }
    return result;
  }

  /**
   * 兜底方案：通过浏览器引擎从 HTML __INITIAL_STATE__ 提取数据。
   * @param endpointName XhsFallbackEndpoints 中的 name。
   * @param params 页面 URL 参数（keyword / user_id / note_id）。
   * @param session 可选登录态。
   */
  async fetchPageData(endpointName: string, params: Record<string, string>, session?: CrawlerSession): Promise<PageData> {
    const fb = XhsFallbackEndpoints.find((e) => e.name === endpointName);
    if (!fb) throw new Error(`未知兜底端点: ${endpointName}`);
    const url = fb.pageUrl.replace(/\{(\w+)\}/g, (_, k: string) => encodeURIComponent(params[k] || k));
    const selector = endpointName === "笔记详情" ? ".note-container" : endpointName === "搜索笔记" ? ".search-result" : undefined;

    // 签名注入：在浏览器中运行 SDK 生成动态追踪头，用正确签名替换
    const fp = this.fp.getFingerprint();
    let disableInjector: (() => void) | undefined;
    const { browser, startTime } = await this.fetchPageContent(url, session, ".xiaohongshu.com", selector, async (page: any) => {
      disableInjector = setupSignatureInjection(page, session, fp.userAgent, fp.platform);
    });
    try {
      await browser.executeScript("window.scrollTo(0, " + (200 + Math.floor(Math.random() * 600)) + ")").catch(() => {});
      await new Promise((r) => setTimeout(r, 500));

      // 使用统一的 safeExtractInitialState 提取数据（三层降级，永不崩溃）
      const parsed = await safeExtractInitialState(browser);
      this.logger.debug(`[safeExtract] ${endpointName}: keys=${Object.keys(parsed).join(",")}, hasData=${parsed._hasData}, method=${parsed._method || "?"}`);

      // 根据 dataPath 决定输出内容
      const pathKeys = fb.dataPath.split(".");
      let output: any = parsed;
      for (const k of pathKeys) {
        if (output && typeof output === "object") output = output[k];
        else { output = parsed; break; }
      }
      // 如果路径提取不到数据，输出整个扁平化结果
      if (!output || (typeof output === "object" && Object.keys(output).length === 0)) output = parsed;

      return { url, statusCode: 200, body: JSON.stringify(output),
        headers: { "content-type": "application/json; charset=utf-8" },
        responseTime: Date.now() - startTime, capturedAt: new Date().toISOString() };
    } finally {
      if (disableInjector) disableInjector();
      await browser.close();
    }
  }

  /**
   * 组合采集：一次收集多个内容单元。
   * 自动编排每个单元的采集方式（签名直连 / 页面提取）。
   */
  async collectUnits(
    units: XhsContentUnit[],
    params: Record<string, string>,
    session?: CrawlerSession,
    authMode: "logged_in" | "guest" = "logged_in",
  ): Promise<UnitResult[]> {
    // URL 意图解析：如果提供了 url 参数，自动提取 ID
    if (params.url) {
      const resolved = resolveXiaohongshuUrl(params.url);
      for (const [k, v] of Object.entries(resolved)) {
        if (!params[k]) params[k] = v;
      }
    }

    // 侦察：从用户主页自动提取 note_id（用于 note_detail / note_comments）
    const needsNoteId = units.some((u) => ["note_detail", "note_comments", "note_sub_replies"].includes(u)) && !params.note_id;
    if (needsNoteId && params.user_id) {
      try {
        const r = await this.fetchPageData("用户主页", { user_id: params.user_id }, session);
        const data = JSON.parse(r.body);
        // 从 __INITIAL_STATE__ 中提取第一个笔记的 ID
        const notes = data?.search?.notes || data?.notes || data?.items || [];
        const firstNote = Array.isArray(notes) ? notes[0] : null;
        if (firstNote?.id) params.note_id = String(firstNote.id);
        else if (firstNote?.note_id) params.note_id = String(firstNote.note_id);
        // 备选：遍历对象键提取
        if (!params.note_id) {
          for (const key of Object.keys(data)) {
            const val = data[key];
            if (val && typeof val === "object" && !Array.isArray(val)) {
              const innerNotes = val?.notes || val?.items || [];
              if (Array.isArray(innerNotes) && innerNotes.length > 0) {
                const n = innerNotes[0];
                if (n?.id) { params.note_id = String(n.id); break; }
                if (n?.note_id) { params.note_id = String(n.note_id); break; }
              }
            }
          }
        }
      } catch (e) {
        this.logger.warn(`⚠️ 笔记 ID 提取失败: ${(e as Error).message}`);
      }
    }

    // 侦察：从 examine URL 提取作者 user_id（用于 user_info / user_posts）
    const needsUserId = units.some((u) => ["user_info", "user_posts"].includes(u)) && !params.user_id && !!params.note_id;
    if (needsUserId) {
      try {
        const r = await this.fetchPageData("笔记详情", { note_id: params.note_id }, session);
        const data = JSON.parse(r.body);
        const uid = data.userId || data.user_id || "";
        if (uid) params.user_id = uid;
      } catch (e) {
        this.logger.warn(`⚠️ 作者 ID 提取失败: ${(e as Error).message}`);
      }
    }
    // 如果 note_detail 不在计划中但需要 user_id，直接打开 explore 页提取
    if (!needsUserId && units.some((u) => ["user_info", "user_posts"].includes(u)) && !params.user_id && params.note_id) {
      try {
        const r = await this.fetchPageData("笔记详情", { note_id: params.note_id }, session);
        const data = JSON.parse(r.body);
        const uid = data.userId || data.user_id || "";
        if (uid) params.user_id = uid;
      } catch {}
    }

    const results: UnitResult[] = [];

    // 🔀 打乱单元请求顺序
    const shuffled = [...units];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const paused = this.rateLimiter.isPaused;
    if (paused) this.logger.warn("⏸️ [xiaohongshu] 站点冷却中，后续采集将使用页面提取兜底");

    for (const unit of shuffled) {
      const start = Date.now();
      try {
        switch (unit) {
          case "user_info": {
            if (this.rateLimiter.isPaused) {
              results.push({ unit, status: "partial", data: null, method: "none", error: "站点冷却中，跳过签名请求", responseTime: 0 });
              break;
            }
            const r = await this.fetchApi("用户信息", {}, session, authMode);
            results.push({ unit, status: "success", data: JSON.parse(r.body).data ?? {}, method: "signature", responseTime: r.responseTime });
            break;
          }
          case "user_posts": {
            const r = await this.fetchPageData("用户主页", { user_id: params.user_id || "" }, session);
            const parsed = JSON.parse(r.body);
            results.push({ unit, status: parsed ? "success" : "partial", data: parsed, method: "html_extract", responseTime: r.responseTime });
            break;
          }
          case "user_board": {
            if (this.rateLimiter.isPaused) {
              results.push({ unit, status: "partial", data: null, method: "none", error: "站点冷却中，跳过签名请求", responseTime: 0 });
              break;
            }
            const r = await this.fetchApi("收藏列表", {}, session, authMode);
            const d = JSON.parse(r.body);
            results.push({ unit, status: d.code === 0 ? "success" : "partial", data: d, method: "signature", responseTime: r.responseTime, error: d.code !== 0 ? d.msg || "签名偏差" : undefined });
            break;
          }
          case "note_detail": {
            const nid = params.note_id || "";
            const r = await this.fetchPageData("笔记详情", { note_id: nid }, session);
            const parsed = JSON.parse(r.body);
            results.push({ unit, status: parsed ? "success" : "partial", data: parsed, method: "html_extract", responseTime: r.responseTime });
            break;
          }
          case "search_notes": {
            const kw = params.keyword || "";
            const r = await this.fetchPageData("搜索笔记", { keyword: kw }, session);
            const parsed = JSON.parse(r.body);
            results.push({ unit, status: parsed ? "success" : "partial", data: parsed, method: "html_extract", responseTime: r.responseTime });
            break;
          }
          case "note_comments": {
            const noteId = params.note_id || "";
            if (!noteId) { results.push({ unit, status: "failed", data: null, method: "none", error: "缺少 note_id", responseTime: 0 }); break; }
            const maxPages = Math.min(parseInt(params.max_pages || "3"), 10);
            let allComments: any[] = [];
            let totalTime = 0;
            let cursor = "0";
            for (let page = 0; page < maxPages; page++) {
              try {
                const r = await this.fetchApi("笔记评论", { note_id: noteId, cursor }, session);
                const d = JSON.parse(r.body);
                totalTime += r.responseTime;
                if (d.code === 0 && d.data?.comments) {
                  allComments = allComments.concat(d.data.comments);
                  if (d.data.cursor?.is_end) break;
                  cursor = d.data.cursor?.next || "0";
                } else break;
              } catch { break; }
            }
            results.push({ unit, status: allComments.length > 0 ? "success" : "partial", data: { code: 0, data: { comments: allComments, cursor: { all_count: allComments.length } } }, method: "signature", responseTime: totalTime });
            break;
          }
          case "note_sub_replies": {
            const nid = params.note_id || "";
            if (!nid) { results.push({ unit, status: "failed", data: null, method: "none", error: "缺少 note_id", responseTime: 0 }); break; }
            const root = params.root || "";
            const maxSub = Math.min(parseInt(params.max_sub_reply_pages || "5"), 20);

            if (root) {
              let allReplies: any[] = [];
              let totalTime = 0;
              let cursor = "0";
              for (let page = 0; page < maxSub; page++) {
                try {
                  const r = await this.fetchApi("笔记子回复", { note_id: nid, rpid: root, cursor }, session);
                  const d = JSON.parse(r.body);
                  totalTime += r.responseTime;
                  if (d.code === 0 && d.data?.comments) {
                    allReplies = allReplies.concat(d.data.comments);
                    if (d.data.cursor?.is_end) break;
                    cursor = d.data.cursor?.next || "0";
                  } else break;
                } catch { break; }
              }
              results.push({ unit, status: "success", data: { code: 0, data: { comments: { [root]: { replies: allReplies, all_count: allReplies.length } }, total_replies: allReplies.length, expanded_count: allReplies.length > 0 ? 1 : 0 } }, method: "signature", responseTime: totalTime });
            } else {
              const commentsResult: any = results.find((r) => r.unit === "note_comments" && r.status === "success");
              if (!commentsResult) { results.push({ unit, status: "failed", data: null, method: "none", error: "自动展开子回复需要先勾选「笔记评论」采集单元", responseTime: 0 }); break; }
              const topComments: any[] = commentsResult.data?.data?.comments || [];
              const rpids = topComments.map((r: any) => String(r.id)).filter(Boolean);
              if (rpids.length === 0) { results.push({ unit, status: "success", data: { code: 0, data: { comments: {}, total_replies: 0, expanded_count: 0 } }, method: "signature", responseTime: 0 }); break; }
              const target = rpids.slice(0, 100);
              const rpidResults = await this.runWithConcurrency(target, 3, async (rpid: string) => {
                await new Promise((r2) => setTimeout(r2, 500));
                let replies: any[] = [];
                let t = 0;
                let c = "0";
                for (let p = 0; p < maxSub; p++) {
                  try {
                    const r = await this.fetchApi("笔记子回复", { note_id: nid, rpid, cursor: c }, session);
                    const d = JSON.parse(r.body);
                    t += r.responseTime;
                    if (d.code === 0 && d.data?.comments) { replies = replies.concat(d.data.comments); if (d.data.cursor?.is_end) break; c = d.data.cursor?.next || "0"; } else break;
                  } catch { break; }
                }
                return { rpid, replies, all_count: replies.length, subReplyTime: t };
              });
              const byRpid: Record<string, any> = {};
              let totalReplies = 0;
              let expandedCount = 0;
              for (const rr of rpidResults) {
                if (rr.all_count > 0) { byRpid[rr.rpid] = { replies: rr.replies, all_count: rr.all_count }; totalReplies += rr.all_count; expandedCount++; }
              }
              results.push({ unit, status: "success", data: { code: 0, data: { comments: byRpid, total_replies: totalReplies, expanded_count: expandedCount } }, method: "signature", responseTime: rpidResults.reduce((s, r) => s + r.subReplyTime, 0) });
            }
            break;
          }
          default:
            results.push({ unit, status: "failed", data: null, method: "none", error: `未知单元: ${unit}`, responseTime: 0 });
        }
      } catch (e: any) {
        results.push({ unit, status: "failed", data: null, method: "none", error: e.message, responseTime: Date.now() - start });
      }
    }
    return results;
  }
}

// ── 辅助函数 ───────────────────────────────────────────

export function buildXsCommon(userAgent: string, platform: string): string {
  const info = {
    s0: Date.now().toString(36),
    s1: "",
    x0: "1",
    x1: "3.6.8",
    x2: platform === "Win32" ? "Windows" : platform === "MacIntel" ? "macOS" : "Linux",
    x3: "xhs-pc-web",
    x4: "4.0.16",
    x5: userAgent.slice(0, 80),
    x6: "zh-CN",
    x7: "",
  };
  return Buffer.from(JSON.stringify(info)).toString("base64");
}

function buildXsLegacy(xt: string): string {
  const input = xt + "xhs_sec_key_placeholder";
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, "0") + "_" + Date.now().toString(36);
}

function generateXhsId(): string {
  return Array.from({ length: 21 }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)]).join("");
}
