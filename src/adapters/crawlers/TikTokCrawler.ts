import { CrawlerSession, PageData } from "../../core/ports/ISiteCrawler";
import { IProxyProvider } from "../../core/ports/IProxyProvider";
import { UnitResult } from "../../core/models/ContentUnit";
import { signTtRequestV2 } from "../../utils/crypto/tiktok-signer-v2";
import { resolveTikTokUrl } from "../../utils/url-resolver";
import { BaseCrawler } from "./BaseCrawler";

const TT_DOMAIN = "tiktok.com";
const TT_API_HOST = "www.tiktok.com";

const TIKTOK_WAIT_SELECTORS: Record<string, string> = {
  foryou: "div[data-e2e=\"recommend-list-item\"], div[class*=\"DivItemContainer\"]",
  user_profile: "a[href*=\"/video/\"], div[data-e2e=\"user-profile-item\"]",
  search: "div[data-e2e=\"search-result-item\"], div[class*=\"SearchResultItem\"]",
  explore: "div[data-e2e=\"explore-item\"], div[class*=\"ExploreItemContainer\"]",
  video_detail: "h1[data-e2e=\"video-title\"], div[data-e2e=\"video-detail\"]",
};

const PAGE_TYPE_MAP: Record<string, string> = {
  "推荐Feed": "foryou",
  "用户主页": "user_profile",
  "视频详情": "video_detail",
  "搜索": "search",
  "热搜": "explore",
};

export interface TtEndpointDef {
  name: string;
  path: string;
  method?: string;
  params?: string;
  status?: "verified" | "sig_pending" | "risk_ctrl";
}

export interface TtFallbackDef {
  name: string;
  pageUrl: string;
  dataPath: string;
}

export const TtFallbackEndpoints: ReadonlyArray<TtFallbackDef> = [
  { name: "推荐Feed", pageUrl: "https://www.tiktok.com/foryou", dataPath: "feed" },
  { name: "用户主页", pageUrl: "https://www.tiktok.com/@{unique_id}", dataPath: "user.profile" },
  { name: "视频详情", pageUrl: "https://www.tiktok.com/@{unique_id}/video/{video_id}", dataPath: "video.detail" },
  { name: "搜索", pageUrl: "https://www.tiktok.com/search?q={keyword}", dataPath: "search.results" },
  { name: "热搜", pageUrl: "https://www.tiktok.com/explore", dataPath: "explore.trends" },
];

// ── API 端点 ──
// 前 6 个基于社区逆向工程；后 8 个来自 CDP Network.requestWillBeSent 捕获（2026-05-01）。
// 全部需要 X-Bogus 签名（当前为 Phase 1 简化签名），状态 sig_pending。
// X-Bogus 注入路径：TikTok WASM SDK → socket 层（CDP 亦不可见），需还原 WASM 算法。

export const TtApiEndpoints: ReadonlyArray<TtEndpointDef> = [
  // ── 核心业务端点（社区逆向） ──
  { name: "推荐Feed", path: "/api/recommend/item_list/", params: "aid=1988&app_name=tiktok_web&device_platform=web_pc&count=30", status: "sig_pending" },
  { name: "视频详情", path: "/api/item/detail/", params: "aid=1988&item_id={video_id}", status: "sig_pending" },
  { name: "用户信息", path: "/api/user/detail/", params: "aid=1988&unique_id={unique_id}", status: "sig_pending" },
  { name: "用户视频", path: "/api/post/item_list/", params: "aid=1988&secUid={secUid}&count=30", status: "sig_pending" },
  { name: "搜索视频", path: "/api/search/search/", params: "aid=1988&keyword={keyword}&count=20", status: "sig_pending" },
  { name: "热搜列表", path: "/api/explore/", params: "aid=1988&device_platform=web_pc", status: "sig_pending" },

  // ── 辅助端点（CDP 捕获发现） ──
  { name: "合规设置", path: "/api/compliance/settings/", status: "sig_pending" },
  { name: "IM关系", path: "/api/im/spotlight/relation", status: "sig_pending" },
  { name: "隐私影响计数", path: "/api/privacy/user/effected_count/v1", status: "sig_pending" },
  { name: "用户收藏", path: "/api/user/collection_list/", status: "sig_pending", params: "user_id={user_id}" },
  { name: "最新回复", path: "/api/feedback/v1/newest_reply/", status: "sig_pending" },
  { name: "通知数量", path: "/api/inbox/notice_count/", status: "sig_pending" },
  { name: "全局页脚", path: "/api/global-footer/graphql", method: "POST", status: "sig_pending" },
  { name: "用户设置", path: "/api/user/settings/", status: "sig_pending" },
];

export class TikTokCrawler extends BaseCrawler {
  readonly name = "tiktok";
  readonly domain = TT_DOMAIN;

  constructor(proxyProvider?: IProxyProvider) { super("tiktok", proxyProvider); }

  matches(url: string): boolean {
    try { return new URL(url).hostname.includes(TT_DOMAIN); } catch { return false; }
  }

  protected getReferer(_url: string): string {
    return "https://www.tiktok.com/";
  }

  protected addAuthHeaders(headers: Record<string, string>, url: string, method: string, body: string, session?: CrawlerSession): void {
    if (session) {
      for (const c of session.cookies) {
        if (["ttwid", "tt_csrf_token", "s_v_web_id"].includes(c.name)) {
          headers[c.name] = c.value;
        }
      }
    }
    // 使用 v2 签名（X-Bogus），服务不可用时降级到 v1（Phase 1 MD5）
    const cookie = session?.cookies?.map((c) => `${c.name}=${c.value}`).join("; ") || "";
    signTtRequestV2(url, method, body, headers, cookie).then((signParams) => Object.assign(headers, signParams));
  }

  async fetchApi(endpointName: string, params?: Record<string, string>, session?: CrawlerSession): Promise<PageData> {
    const ep = TtApiEndpoints.find((e) => e.name === endpointName);
    if (!ep) throw new Error(`未知端点: ${endpointName}`);
    let query = ep.params || "";
    if (params) {
      for (const [k, v] of Object.entries(params)) query = query.replace(`{${k}}`, encodeURIComponent(v));
    }
    return this.fetchWithRetry(`https://${TT_API_HOST}${ep.path}?${query}`, session);
  }

  async fetchPageData(pageType: string, params: Record<string, string>, session?: CrawlerSession): Promise<PageData> {
    const fb = TtFallbackEndpoints.find((e) => e.name === pageType);
    if (!fb) throw new Error(`未知兜底端点: ${pageType}`);
    const url = fb.pageUrl.replace(/\{(\w+)\}/g, (_, k: string) => encodeURIComponent(params[k] || k));
    const selectorKey = PAGE_TYPE_MAP[pageType];
    const contentSelector = selectorKey ? TIKTOK_WAIT_SELECTORS[selectorKey] : undefined;
    const { browser, startTime } = await this.fetchPageContent(url, session, ".tiktok.com", contentSelector);
    try {
      await browser.executeScript("window.scrollTo(0, " + (200 + Math.floor(Math.random() * 600)) + ")").catch(() => {});
      await new Promise((r) => setTimeout(r, 500));

      const rawData = await browser.executeScript<string>(`(() => {
        const result: any = { title: document.title, _hasSigi: false, _hasUdl: false };
        const sigi = (window as any).SIGI_STATE;
        if (sigi) {
          result._hasSigi = true;
          // 安全提取关键字段——避免 JSON.stringify 因循环引用失败
          try {
            if (sigi.ItemModule) {
              const items: any = {};
              let count = 0;
              for (const [k, v] of Object.entries(sigi.ItemModule)) {
                if (count >= 30) break;
                items[k] = { author: (v as any)?.author, desc: ((v as any)?.desc || '').slice(0, 120), createTime: (v as any)?.createTime, stats: (v as any)?.stats };
                count++;
              }
              result.ItemModule = items;
            }
            if (sigi.UserModule?.users) {
              const users: any = {};
              for (const [k, v] of Object.entries(sigi.UserModule.users)) {
                users[k] = { uniqueId: (v as any)?.uniqueId, nickname: (v as any)?.nickname, followerCount: (v as any)?.followerCount };
              }
              result.UserModule = users;
            }
            if (sigi.ItemList) result.ItemList = sigi.ItemList;
          } catch(e) { result._sigiError = String(e); }
        }
        const udl = document.getElementById('__UNIVERSAL_DATA_FOR_LAYOUT__');
        if (udl) {
          result._hasUdl = true;
          try { result.__UNIVERSAL_DATA_FOR_LAYOUT__ = JSON.parse(udl.textContent || '{}'); } catch(e) { result._udlError = String(e); }
        }
        return JSON.stringify(result, (key, val) => {
          if (typeof val === 'bigint') return Number(val);
          return val;
        });
      })()`).catch(() => "{}");

      return { url, statusCode: 200, body: rawData,
        headers: { "content-type": "application/json;charset=utf-8" },
        responseTime: Date.now() - startTime, capturedAt: new Date().toISOString() };
    } finally {
      await browser.close();
    }
  }

  /** 从页面数据中提取 ID。返回 { uniqueIds, videoIds }。 */
  private extractIdsFromPageData(raw: string): { uniqueIds: string[]; videoIds: string[] } {
    const uniqueIds: string[] = [];
    const videoIds: string[] = [];
    try {
      const data = JSON.parse(raw);
      // SIGI_STATE.ItemModule — 推荐/首页数据
      const module = data.ItemModule || data.SIGI_STATE?.ItemModule;
      if (module) {
        for (const [vid, item] of Object.entries(module) as [string, any][]) {
          if (!videoIds.includes(vid)) videoIds.push(vid);
          const uid = item?.author?.uniqueId || item?.author?.id || "";
          if (uid && !uniqueIds.includes(uid)) uniqueIds.push(uid);
        }
      }
      // SIGI_STATE.UserModule — 用户主页数据
      const users = data.UserModule?.users || data.SIGI_STATE?.UserModule?.users;
      if (users) {
        for (const u of Object.values(users) as any[]) {
          if (u?.uniqueId && !uniqueIds.includes(u.uniqueId)) uniqueIds.push(u.uniqueId);
        }
      }
      // __UNIVERSAL_DATA_FOR_LAYOUT__ 搜索数据
      const layout = data.__UNIVERSAL_DATA_FOR_LAYOUT__;
      if (layout) {
        const modules = layout?.__DEFAULT_SCOPE__?.webapp?.search?.default?.modules || [];
        for (const mod of modules) {
          for (const item of mod?.moduleList || []) {
            if (item?.item?.id && !videoIds.includes(item.item.id)) videoIds.push(item.item.id);
            if (item?.item?.author?.uniqueId && !uniqueIds.includes(item.item.author.uniqueId)) uniqueIds.push(item.item.author.uniqueId);
          }
        }
      }
    } catch {}
    return { uniqueIds, videoIds };
  }

  private async scoutIds(params: Record<string, string>, session?: CrawlerSession): Promise<void> {
    if (params.video_id && params.unique_id) return;
    if (!params.keyword && params.video_id && !params.unique_id) return;
    if (!params.keyword && !params.video_id && !params.unique_id) return;

    const scoutUrl = params.keyword
      ? `https://www.tiktok.com/search?q=${encodeURIComponent(params.keyword)}`
      : "https://www.tiktok.com/foryou";
    const selector = params.keyword ? TIKTOK_WAIT_SELECTORS.search : TIKTOK_WAIT_SELECTORS.foryou;

    const { browser } = await this.fetchPageContent(scoutUrl, session, ".tiktok.com", selector);
    try {
      const rawData = await browser.executeScript<string>(`(() => {
        const result: any = {};
        const sigi = (window as any).SIGI_STATE;
        if (sigi) {
          if (sigi.ItemModule) result.ItemModule = sigi.ItemModule;
          if (sigi.UserModule) result.UserModule = sigi.UserModule;
        }
        const udl = document.getElementById('__UNIVERSAL_DATA_FOR_LAYOUT__');
        if (udl) { try { result.__UNIVERSAL_DATA_FOR_LAYOUT__ = JSON.parse(udl.textContent || '{}'); } catch {} }
        return JSON.stringify(result);
      })()`).catch(() => "{}");

      const { uniqueIds, videoIds } = this.extractIdsFromPageData(rawData);
      if (videoIds.length > 0 && !params.video_id) params.video_id = videoIds[0];
      if (uniqueIds.length > 0 && !params.unique_id) params.unique_id = uniqueIds[0];
      if (videoIds.length > 0 && !params.item_id) params.item_id = videoIds[0];
      if (uniqueIds.length > 0 && !params.secUid) params.secUid = uniqueIds[0];
      if (videoIds.length > 0) this.logger.info(`  🕵️ 自动提取: ${videoIds.length} 个视频ID, ${uniqueIds.length} 个用户ID`);
    } finally {
      await browser.close();
    }
  }

  async collectUnits(units: string[], params: Record<string, string>, session?: CrawlerSession, _authMode?: string): Promise<UnitResult<unknown>[]> {
    if (params.url) {
      const resolved = resolveTikTokUrl(params.url);
      for (const [k, v] of Object.entries(resolved)) {
        if (!params[k]) params[k] = v;
      }
    }

    const needsScout = units.some((u) =>
      ["tt_video_detail", "tt_video_comments"].includes(u) && !params.video_id && !params.item_id
      || ["tt_user_info", "tt_user_videos"].includes(u) && !params.unique_id
    );
    if (needsScout) await this.scoutIds(params, session);

    const results: UnitResult<unknown>[] = [];
    const shuffled = [...units];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const paused = this.rateLimiter.isPaused;
    if (paused) this.logger.warn("⏸️ [tiktok] 站点冷却中，后续采集将使用页面提取兜底");

    for (const unit of shuffled) {
      const start = Date.now();
      try {
        switch (unit) {
          case "tt_feed": {
            if (!paused) {
              try { const r = await this.fetchApi("推荐Feed", {}, session); const d = JSON.parse(r.body); if (d && Object.keys(d).length > 1) { results.push({ unit, status: "success", data: d, method: "signature", responseTime: r.responseTime }); break; } } catch {}
            }
            const r = await this.fetchPageData("推荐Feed", {}, session);
            results.push({ unit, status: "partial", data: JSON.parse(r.body), method: "html_extract", responseTime: r.responseTime });
            break;
          }
          case "tt_video_detail": {
            const vid = params.video_id || params.item_id || "";
            if (!vid) { results.push({ unit, status: "failed", data: null, method: "none", error: "无法自动获取 video_id。请提供含 video_id 的 URL，或先勾选「推荐Feed」自动提取", responseTime: 0 }); break; }
            if (!paused) {
              try { const r = await this.fetchApi("视频详情", { video_id: vid }, session); const d = JSON.parse(r.body); if (d && Object.keys(d).length > 1) { results.push({ unit, status: "success", data: d, method: "signature", responseTime: r.responseTime }); break; } } catch {}
            }
            const r = await this.fetchPageData("视频详情", { video_id: vid, unique_id: params.unique_id || "" }, session);
            results.push({ unit, status: "partial", data: JSON.parse(r.body), method: "html_extract", responseTime: r.responseTime });
            break;
          }
          case "tt_user_info": {
            const uid = params.unique_id || "";
            if (!uid) { results.push({ unit, status: "failed", data: null, method: "none", error: "无法自动获取 unique_id。请提供 /@username 格式的 URL，或先勾选「推荐Feed」自动提取", responseTime: 0 }); break; }
            if (!paused) {
              try { const r = await this.fetchApi("用户信息", { unique_id: uid }, session); const d = JSON.parse(r.body); if (d && Object.keys(d).length > 1) { results.push({ unit, status: "success", data: d, method: "signature", responseTime: r.responseTime }); break; } } catch {}
            }
            const r = await this.fetchPageData("用户主页", { unique_id: uid }, session);
            results.push({ unit, status: "partial", data: JSON.parse(r.body), method: "html_extract", responseTime: r.responseTime });
            break;
          }
          case "tt_user_videos": {
            const uid2 = params.unique_id || "";
            if (!uid2) { results.push({ unit, status: "failed", data: null, method: "none", error: "无法自动获取 unique_id", responseTime: 0 }); break; }
            if (!paused) {
              try { const r = await this.fetchApi("用户视频", { unique_id: uid2, secUid: params.secUid || uid2 }, session); const d = JSON.parse(r.body); if (d && Object.keys(d).length > 1) { results.push({ unit, status: "success", data: d, method: "signature", responseTime: r.responseTime }); break; } } catch {}
            }
            const r = await this.fetchPageData("用户主页", { unique_id: uid2 }, session);
            results.push({ unit, status: "partial", data: JSON.parse(r.body), method: "html_extract", responseTime: r.responseTime });
            break;
          }
          case "tt_video_comments": {
            const vid2 = params.video_id || params.item_id || "";
            if (!vid2) { results.push({ unit, status: "failed", data: null, method: "none", error: "无法自动获取 video_id", responseTime: 0 }); break; }
            const r = await this.fetchPageData("视频详情", { video_id: vid2, unique_id: params.unique_id || "" }, session);
            results.push({ unit, status: "partial", data: JSON.parse(r.body), method: "html_extract", responseTime: r.responseTime });
            break;
          }
          case "tt_search": {
            const kw = params.keyword || "";
            if (!kw) { results.push({ unit, status: "failed", data: null, method: "none", error: "缺少 keyword", responseTime: 0 }); break; }
            if (!paused) {
              try { const rs = await this.fetchApi("搜索视频", { keyword: kw }, session); const d = JSON.parse(rs.body); if (d && Object.keys(d).length > 1) { results.push({ unit, status: "success", data: d, method: "signature", responseTime: rs.responseTime }); break; } } catch {}
            }
            const rf = await this.fetchPageData("搜索", { keyword: kw }, session);
            results.push({ unit, status: "partial", data: JSON.parse(rf.body), method: "html_extract", responseTime: rf.responseTime });
            break;
          }
          case "tt_trending": {
            if (!paused) {
              try { const rs = await this.fetchApi("热搜列表", {}, session); const d = JSON.parse(rs.body); if (d && Object.keys(d).length > 1) { results.push({ unit, status: "success", data: d, method: "signature", responseTime: rs.responseTime }); break; } } catch {}
            }
            const rf = await this.fetchPageData("热搜", {}, session);
            results.push({ unit, status: "partial", data: JSON.parse(rf.body), method: "html_extract", responseTime: rf.responseTime });
            break;
          }
          default:
            results.push({ unit, status: "failed", data: null, method: "none", error: "未知单元", responseTime: 0 });
        }
      } catch (e: unknown) {
        results.push({ unit, status: "failed", data: null, method: "none", error: e instanceof Error ? e.message : String(e), responseTime: Date.now() - start });
      }
    }
    return results;
  }
}
