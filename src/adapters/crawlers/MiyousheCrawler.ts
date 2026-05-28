import { CrawlerSession, PageData, FetchOptions } from "../../core/ports/ISiteCrawler.js";
import { IProxyProvider } from "../../core/ports/IProxyProvider.js";
import { buildMiyousheHeaders } from "../../utils/crypto/miyoushe-signer.js";
import { UnitResult } from "../../core/models/ContentUnit.js";
import { BaseCrawler } from "./BaseCrawler.js";
import type { MiyoushePostDetail, MiyousheUserInfo, MiyousheCommentItem, MiyousheSearchItem } from "../../core/models/crawler-data.js";

const DOMAIN = "miyoushe.com";
const API_HOST = "bbs-api.miyoushe.com";

export class MiyousheCrawler extends BaseCrawler {
  readonly name = "miyoushe";
  readonly domain = DOMAIN;

  constructor(proxyProvider?: IProxyProvider) { super("miyoushe", proxyProvider); this.registerHandlers(); }

  private registerHandlers(): void {
    this.registerPostDetailHandler();
    this.registerUserInfoHandler();
    this.registerPostCommentsHandler();
    this.registerSearchPostsHandler();
  }

  // ── miyoushe_post_detail ──

  private registerPostDetailHandler(): void {
    this.unitHandlers.set("miyoushe_post_detail", async (unit, params, session) => {
      const postId = params.post_id || "";
      if (!postId) return { unit, status: "failed", data: null, method: "none", error: "缺少 post_id", responseTime: 0 };
      const query = `gids=2&post_id=${encodeURIComponent(postId)}&read=1`;
      const url = `https://${API_HOST}/post/wapi/getPostFull?${query}`;
      try {
        const { r, responseTime, data } = await this.signedGet(url, query, session);
        if (data.retcode === 0) {
          const post = ((data.data as Record<string, unknown>)?.post as Record<string, unknown>)?.post as Record<string, unknown> || {};
          const stats = (post.stats as Record<string, unknown>) || {};
          const images: string[] = [];
          const imgRegex = /<img[^>]+src="([^"]+)"/g; let m: RegExpExecArray | null;
          while ((m = imgRegex.exec(String(post.content || ""))) !== null) images.push(m[1]);
          const topics = (post.topics as Array<Record<string, unknown>>) || [];
          return { unit, status: "success", data: { postId: String(post.post_id || ""), subject: String(post.subject || ""), content: String(post.content || ""), plainText: String(post.content || "").replace(/<[^>]+>/g, "").trim(), images, uid: String(post.uid || ""), created_at: this.safeNum(post.created_at), view_status: this.safeNum(post.view_status), is_original: this.safeNum(post.is_original), forum_id: this.safeNum(post.f_forum_id), topics: topics.map((t) => String(t.name || "")).filter(Boolean), stats: { view: this.safeNum(stats.view), like: this.safeNum(stats.like), reply: this.safeNum(stats.reply), favorite: this.safeNum(stats.favorite), share: this.safeNum(stats.share) } } as MiyoushePostDetail, method: "signature", responseTime };
        }
        return { unit, status: "partial", data: { raw: data }, method: "signature", responseTime, error: `米游社 API 返回异常: retcode=${data.retcode}` };
      } catch (e: unknown) {
        return { unit, status: "failed", data: null, method: "signature", responseTime: 0, error: `API 请求失败: ${(e as Error).message}` };
      }
    });
  }

  // ── miyoushe_user_info ──

  private registerUserInfoHandler(): void {
    this.unitHandlers.set("miyoushe_user_info", async (unit, params, session) => {
      const uid = params.uid || params.user_id || "";
      if (!uid) return { unit, status: "failed", data: null, method: "none", error: "缺少 uid", responseTime: 0 };
      const query = `gids=2&uid=${encodeURIComponent(uid)}`;
      const url = `https://${API_HOST}/user/wapi/getUserFullInfo?${query}`;
      try {
        const { responseTime, data } = await this.signedGet(url, query, session);
        if (data.retcode === 0) {
          const info = (data.data as Record<string, unknown>)?.user_info as Record<string, unknown> || {};
          const achieve = (info.achieve as Record<string, unknown>) || {};
          const community = (info.community_info as Record<string, unknown>) || {};
          const levelExp = (info.level_exp as Record<string, unknown>) || {};
          return { unit, status: "success", data: { uid: String(info.uid || ""), nickname: String(info.nickname || ""), introduce: String(info.introduce || ""), avatar_url: String(info.avatar_url || ""), gender: this.safeNum(info.gender), level: this.safeNum(levelExp.level), level_exp: this.safeNum(levelExp.exp), like_num: this.safeNum(achieve.like_num), post_num: this.safeNum(achieve.post_num), replypost_num: this.safeNum(achieve.replypost_num), follow_cnt: this.safeNum(achieve.follow_cnt), followed_cnt: this.safeNum(achieve.followed_cnt), is_realname: !!community.is_realname, ip_region: String(data.data ? ((data.data as Record<string, unknown>).user_info as Record<string, unknown>)?.ip_region || "" : "") } as MiyousheUserInfo, method: "signature", responseTime };
        }
        return { unit, status: "partial", data: { raw: data }, method: "signature", responseTime, error: `API 返回异常: retcode=${data.retcode}` };
      } catch (e: unknown) {
        return { unit, status: "failed", data: null, method: "signature", responseTime: 0, error: `API 请求失败: ${(e as Error).message}` };
      }
    });
  }

  // ── miyoushe_post_comments ──

  private registerPostCommentsHandler(): void {
    this.unitHandlers.set("miyoushe_post_comments", async (unit, params, session) => {
      const postId = params.post_id || "";
      if (!postId) return { unit, status: "failed", data: null, method: "none", error: "缺少 post_id", responseTime: 0 };
      const pageSize = Math.min(parseInt(params.pageSize || "20"), 50);
      const query = `gids=2&post_id=${encodeURIComponent(postId)}&is_hot=true&size=${pageSize}`;
      const url = `https://${API_HOST}/post/wapi/getPostReplies?${query}`;
      try {
        const { responseTime, data } = await this.signedGet(url, query, session);
        if (data.retcode === 0) {
          const list = ((data.data as Record<string, unknown>)?.list as Array<Record<string, unknown>>) || [];
          const items: MiyousheCommentItem[] = list.map((r) => {
            const reply = (r.reply as Record<string, unknown>) || {};
            const user = (reply.user as Record<string, unknown>) || {};
            return { reply_id: String(reply.reply_id || ""), uid: String(reply.uid || ""), nickname: String(user.nickname || ""), content: String(reply.content || "").replace(/<[^>]+>/g, "").trim(), like_count: this.safeNum(reply.like_count), created_at: this.safeNum(reply.created_at), sub_reply_count: this.safeNum(reply.sub_reply_count || (reply as any).r_rcount || 0) };
          });
          return { unit, status: items.length > 0 ? "success" : "partial", data: items, method: "signature", responseTime };
        }
        return { unit, status: "partial", data: [], method: "signature", responseTime, error: `API 返回异常: retcode=${data.retcode}` };
      } catch (e: unknown) {
        return { unit, status: "failed", data: null, method: "signature", responseTime: 0, error: `API 请求失败: ${(e as Error).message}` };
      }
    });
  }

  // ── miyoushe_search_posts ──

  private registerSearchPostsHandler(): void {
    this.unitHandlers.set("miyoushe_search_posts", async (unit, params, session) => {
      const keyword = params.keyword || "";
      if (!keyword) return { unit, status: "failed", data: null, method: "none", error: "缺少 keyword", responseTime: 0 };
      const page = parseInt(params.page || "1");
      const pageSize = Math.min(parseInt(params.pageSize || "20"), 50);
      const query = `gids=2&keyword=${encodeURIComponent(keyword)}&page=${page}&size=${pageSize}`;
      const url = `https://${API_HOST}/post/wapi/searchPosts?${query}`;
      try {
        const { responseTime, data } = await this.signedGet(url, query, session);
        if (data.retcode === 0) {
          const list = ((data.data as Record<string, unknown>)?.list as Array<Record<string, unknown>>) || [];
          const items: MiyousheSearchItem[] = list.map((p) => {
            const post = (p.post as Record<string, unknown>) || {};
            const user = (p.user as Record<string, unknown>) || {};
            const forum = (p.forum as Record<string, unknown>) || {};
            const stat = (post.stat || post.stats || {}) as Record<string, unknown>;
            return { post_id: String(post.post_id || p.post_id || ""), subject: String(post.subject || ""), uid: String(post.uid || user.uid || ""), nickname: String(user.nickname || ""), forum_name: String(forum.name || ""), created_at: this.safeNum(post.created_at), reply_count: this.safeNum(stat.reply_count || stat.reply || 0), like_count: this.safeNum(stat.like_count || stat.like || 0), view_status: this.safeNum(post.view_status) };
          });
          return { unit, status: items.length > 0 ? "success" : "partial", data: items, method: "signature", responseTime };
        }
        return { unit, status: "partial", data: [], method: "signature", responseTime, error: `API 返回异常: retcode=${data.retcode}` };
      } catch (e: unknown) {
        return { unit, status: "failed", data: null, method: "signature", responseTime: 0, error: `API 请求失败: ${(e as Error).message}` };
      }
    });
  }

  // ── 公共方法 ──

  matches(url: string): boolean { try { return new URL(url).hostname.includes(DOMAIN); } catch { return false; } }

  async fetch(url: string, session?: CrawlerSession, _options?: FetchOptions): Promise<PageData> {
    const cookieStr = (session?.cookies ?? []).map((c) => `${c.name}=${c.value}`).join("; ");
    const headers: Record<string, string> = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", Referer: "https://www.miyoushe.com/", Origin: "https://www.miyoushe.com", ...(cookieStr ? { Cookie: cookieStr } : {}) };
    const start = Date.now();
    const res = await fetch(url, { method: "GET", headers });
    return { url: res.url, statusCode: res.status, body: await res.text(), headers: Object.fromEntries(res.headers), responseTime: Date.now() - start, capturedAt: new Date().toISOString() };
  }

  async collectUnits(units: string[], params: Record<string, string>, session?: CrawlerSession): Promise<UnitResult<unknown>[]> {
    const results: UnitResult[] = [];
    for (const unit of units) { const start = Date.now(); try { results.push(await this.dispatchUnit(unit, params, session)); } catch (e: unknown) { results.push({ unit, status: "failed", data: null, method: "none", responseTime: Date.now() - start, error: (e as Error).message }); } }
    return results;
  }

  // ── 私有辅助 ──

  private async signedGet(url: string, query: string, session?: CrawlerSession): Promise<{ r: PageData; responseTime: number; data: Record<string, unknown> }> {
    const headers = buildMiyousheHeaders(query);
    const cookieStr = (session?.cookies ?? []).map((c) => `${c.name}=${c.value}`).join("; ");
    const allHeaders: Record<string, string> = { ...headers, "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", Referer: "https://www.miyoushe.com/", Origin: "https://www.miyoushe.com", Accept: "application/json, text/plain, */*", ...(cookieStr ? { Cookie: cookieStr } : {}) };
    const start = Date.now();
    const _r = await fetch(url, { method: "GET", headers: allHeaders });
    const responseTime = Date.now() - start;
    const data = JSON.parse(await r.text()) as Record<string, unknown>;
    return { r: { url: r.url, statusCode: r.status, body: JSON.stringify(data), headers: Object.fromEntries(r.headers), responseTime, capturedAt: new Date().toISOString() }, responseTime, data };
  }
}
