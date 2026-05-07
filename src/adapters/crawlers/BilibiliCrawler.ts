import { CrawlerSession, PageData } from "../../core/ports/ISiteCrawler";
import { IProxyProvider } from "../../core/ports/IProxyProvider";
import { buildSignedQuery } from "../../utils/crypto/bilibili-signer";
import { UnitResult } from "../../core/models/ContentUnit";
import { BiliVideoInfo, BiliComments, BiliSearchResult, BiliUserVideos, BiliCommentItem } from "../../core/models/crawler-data";
import { resolveBilibiliUrl } from "../../utils/url-resolver";
import { BaseCrawler } from "./BaseCrawler";

const BILI_DOMAIN = "bilibili.com";
const BILI_API_HOST = "api.bilibili.com";

export interface BiliEndpointDef {
  name: string;
  path: string;
  needWbi?: boolean;
  params?: string;
  status?: "verified" | "sig_pending";
}

const DEFAULT_IMG_KEY = "4932caff0ff746eab6f01bf08b70ac45";
const DEFAULT_SUB_KEY = "4932caff0ff746eab6f01bf08b70ac45";

export const BiliFallbackEndpoints: ReadonlyArray<{
  name: string; pageUrl: string; dataPath: string;
}> = [
  { name: "B站搜索", pageUrl: "https://search.bilibili.com/all?keyword={keyword}", dataPath: "search.videos" },
  { name: "用户视频列表", pageUrl: "https://space.bilibili.com/{mid}/video", dataPath: "user.videos" },
  { name: "视频详情", pageUrl: "https://www.bilibili.com/video/{bvid}", dataPath: "video.detail" },
];

export const BiliApiEndpoints: ReadonlyArray<BiliEndpointDef> = [
  { name: "视频信息", path: "/x/web-interface/view", needWbi: false, params: "aid={aid}", status: "verified" },
  { name: "弹幕列表", path: "/x/v2/dm/web/view", params: "oid=37660265907&type=1", status: "verified" },
  { name: "字幕信息", path: "/x/v2/subtitle/web/view", params: "oid=37660265907", status: "verified" },
  { name: "直播间信息", path: "/xlive/web-room/v1/index/getRoomBaseInfo", params: "uids=173323339&req_biz=video", status: "verified" },
  { name: "视频评论", path: "/x/v2/reply/main", params: "oid={oid}&type=1&mode=3&ps=20", status: "verified" },
  { name: "视频子回复", path: "/x/v2/reply", params: "oid={oid}&type=1&root={root}&ps=20", status: "verified" },
  { name: "搜索综合", path: "/x/web-interface/wbi/search/all/v2", needWbi: true, params: "keyword=%E5%8E%9F%E7%A5%9E&page=1", status: "verified" },
  { name: "搜索 type", path: "/x/web-interface/wbi/search/type", needWbi: true, params: "keyword=%E5%8E%9F%E7%A5%9E&search_type=video&page=1", status: "verified" },
  { name: "弹幕数据(分段)", path: "/x/v2/dm/wbi/web/seg.so", needWbi: true, params: "oid=37660265907&type=1&segment_index=1", status: "sig_pending" },
  { name: "用户空间信息", path: "/x/space/wbi/acc/info", needWbi: true, params: "mid=316627722", status: "sig_pending" },
  { name: "用户投稿", path: "/x/space/wbi/arc/search", needWbi: true, params: "mid=PLACEHOLDER&ps=5&pn=1", status: "sig_pending" },
];

export class BilibiliCrawler extends BaseCrawler {
  readonly name = "bilibili";
  readonly domain = BILI_DOMAIN;
  private imgKey = DEFAULT_IMG_KEY;
  private subKey = DEFAULT_SUB_KEY;

  constructor(proxyProvider?: IProxyProvider) { super("bilibili", proxyProvider); this.registerHandlers(); }

  private registerHandlers(): void {
    this.unitHandlers.set("bili_video_info", async (unit, params, session) => {
      const r = await this.fetchApi("视频信息", { aid: params.aid || "" }, session);
      const d: BiliVideoInfo = JSON.parse(r.body);
      if (d.code === -352) {
        this.logger.warn("⚠️ B站签名触发风控 -352，3秒后重试...");
        await new Promise((r2) => setTimeout(r2, 3000));
        const r2 = await this.fetchApi("视频信息", { aid: params.aid || "" }, session);
        const d2: BiliVideoInfo = JSON.parse(r2.body);
        if (d2.code === 0) return { unit, status: "success", data: d2, method: "signature", responseTime: r2.responseTime };
        this.logger.warn("⚠️ B站签名 -352 重试仍失败，降级到页面提取");
        const pr = await this.fetchPageData("视频详情", { bvid: params.bvid || params.aid || "" }, session);
        return { unit, status: "partial", data: JSON.parse(pr.body) as Record<string, unknown>, method: "html_extract", responseTime: pr.responseTime, error: "签名风控，降级到页面提取" };
      }
      if (d.code === 0) return { unit, status: "success", data: d, method: "signature", responseTime: r.responseTime };
      return { unit, status: "failed", data: null, method: "signature", responseTime: r.responseTime, error: `业务错误码: ${d.code}` };
    });
    this.unitHandlers.set("bili_search", async (unit, params, session) => {
      try {
        const r = await this.fetchApi("搜索 type", { keyword: params.keyword || "", search_type: "video", order: params.sort || "totalrank", page: "1" }, session);
        const d: BiliSearchResult = JSON.parse(r.body);
        if (d.code === 0) return { unit, status: "success", data: d, method: "signature", responseTime: r.responseTime };
      } catch {}
      const r = await this.fetchPageData("B站搜索", { keyword: params.keyword || "" }, session);
      return { unit, status: "success", data: JSON.parse(r.body), method: "html_extract", responseTime: r.responseTime };
    });
    this.unitHandlers.set("bili_user_videos", async (unit, params, session) => {
      let data: BiliUserVideos | Record<string, unknown> | null = null;
      let method = "html_extract";
      let respTime = 0;
      try {
        const r = await this.fetchApi("用户投稿", { mid: params.mid || "", ps: "50", pn: "1" }, session);
        const d: BiliUserVideos = JSON.parse(r.body);
        if (d.code === 0) { data = d; method = "signature"; respTime = r.responseTime; }
      } catch {}
      if (!data) { const r = await this.fetchPageData("用户视频列表", { mid: params.mid || "" }, session); data = JSON.parse(r.body); respTime = r.responseTime; }
      return { unit, status: "success", data, method, responseTime: respTime };
    });
    this.unitHandlers.set("bili_video_comments", async (unit, params, session) => {
      const oid = params.oid || params.aid || "";
      if (!oid) return { unit, status: "failed", data: null, method: "none", error: "缺少 oid", responseTime: 0 };
      const maxPages = Math.min(parseInt(params.max_pages || "3"), 10);
      let allReplies: BiliCommentItem[] = [];
      let totalTime = 0;
      let nextCursor = 0;
      for (let page = 0; page < maxPages; page++) {
        const r = await this.fetchApi("视频评论", { oid, next: String(nextCursor) }, session);
        const d: BiliComments = JSON.parse(r.body);
        if (d.code === -352) {
          this.logger.warn("⚠️ B站评论签名 -352，3秒后重试...");
          await new Promise((r2) => setTimeout(r2, 3000));
          const r2 = await this.fetchApi("视频评论", { oid, next: String(nextCursor) }, session);
          const d2: BiliComments = JSON.parse(r2.body);
          totalTime += r2.responseTime;
          if (d2.code === 0 && d2.data?.replies) { allReplies = allReplies.concat(d2.data.replies); if (d2.data.cursor?.is_end) break; nextCursor = d2.data.cursor?.next ?? 0; } else break;
          continue;
        }
        totalTime += r.responseTime;
        if (d.code === 0 && d.data?.replies) { allReplies = allReplies.concat(d.data.replies); if (d.data.cursor?.is_end) break; nextCursor = d.data.cursor?.next ?? 0; } else break;
      }
      const { data: deduped, deduped_count } = this.dedupComments(allReplies);
      const cleanReplies = deduped.map((r: any) => ({ ...r, type: "main" as const, member: r.member ? { ...r.member } : undefined }));
      return { unit, status: "success", data: { code: 0, data: { replies: cleanReplies, cursor: { all_count: deduped.length, deduped_count } } }, method: "signature", responseTime: totalTime };
    });
    this.unitHandlers.set("bili_video_sub_replies", async (unit, params, session, _authMode, results) => {
      const oid = params.oid || params.aid || "";
      if (!oid) return { unit, status: "failed", data: null, method: "none", error: "缺少 oid", responseTime: 0 };
      const maxSubReplies = Math.min(parseInt(params.max_sub_reply_pages || "5"), 20);
      const root = params.root || "";
      let rootItems: any[];
      if (root) { rootItems = [{ rpid: root }]; } else {
        const cr = results?.find((r) => r.unit === "bili_video_comments" && r.status === "success");
        if (!cr) return { unit, status: "failed", data: null, method: "none", error: "自动展开子回复需要先勾选「视频评论」采集单元，或手动提供 root 参数", responseTime: 0 };
        const cd = cr.data as BiliComments | undefined;
        rootItems = cd?.data?.replies || [];
        if (rootItems.length === 0) return { unit, status: "success", data: { code: 0, data: { comments: {}, total_replies: 0, expanded_count: 0 } }, method: "signature", responseTime: 0 };
        if (rootItems.length > 100) this.logger.warn(`⚠️ 一级评论共 ${rootItems.length} 条，子回复展开量可能较大，限制展开前 100 条`);
      }
      const tr = await this.traverseSubReplies(rootItems, {
        rootIdExtractor: (item: any) => String(item.rpid), maxPages: maxSubReplies, staggerMs: 500,
        fetchPage: async (rid, cur) => {
          const r = await this.fetchApi("视频子回复", { oid, root: String(rid), next: String(cur) }, session);
          const d = JSON.parse(r.body);
          if (d.code === 0 && d.data?.replies?.length) return { replies: d.data.replies, hasMore: !(d.data.cursor?.is_end ?? true), nextCursor: d.data.cursor?.next ?? 0, responseTime: r.responseTime };
          return { replies: [], hasMore: false, nextCursor: 0, responseTime: 0 };
        },
        postProcess: (replies, rid) => {
          const { data: deduped } = this.dedupComments(replies as any);
          return { replies: deduped.map((r: any) => ({ ...r, type: "sub" as const, parent_rpid: Number(rid), member: r.member ? { ...r.member } : undefined })) as any };
        },
      });
      this.logger.info(`✅ 子回复展开完成: ${tr.expandedCount} 条评论有回复，共 ${tr.totalReplies} 条`);
      return { unit, status: "success", data: { code: 0, data: { comments: tr.byRpid, total_replies: tr.totalReplies, expanded_count: tr.expandedCount } }, method: "signature", responseTime: tr.totalTime };
    });
  }

  setWbiKeys(imgKey: string, subKey: string): void {
    this.imgKey = imgKey;
    this.subKey = subKey;
  }

  matches(url: string): boolean {
    try { return new URL(url).hostname.includes(BILI_DOMAIN); } catch { return false; }
  }

  protected getReferer(url: string): string {
    return url.includes("space.bilibili.com") ? url.replace(/\?.*$/, "") : "https://www.bilibili.com/";
  }

  async fetchApi(endpointName: string, params?: Record<string, string>, session?: CrawlerSession): Promise<PageData> {
    const ep = BiliApiEndpoints.find((e) => e.name === endpointName);
    if (!ep) throw new Error(`未知端点: ${endpointName}`);

    let query = ep.params || "";
    if (params) {
      const merged = new URLSearchParams(ep.params || "");
      for (const [k, v] of Object.entries(params)) merged.set(k, v);
      query = merged.toString();
    }

    if (params) {
      const merged = { ...params };
      if (merged.aid && !merged.oid) merged.oid = merged.aid;
      for (const [k, v] of Object.entries(merged)) {
        query = query.replace(`{${k}}`, encodeURIComponent(v));
      }
    }

    if (ep.needWbi) {
      const paramObj: Record<string, string> = {};
      query.split("&").filter(Boolean).forEach((pair) => {
        const [k, v] = pair.split("=");
        if (k) paramObj[k] = decodeURIComponent(v);
      });
      query = buildSignedQuery(paramObj, this.imgKey, this.subKey);
    }

    const url = `https://${BILI_API_HOST}${ep.path}?${query}`;
    return this.fetchWithRetry(url, session);
  }

  async fetchPageData(pageType: string, params: Record<string, string>, session?: CrawlerSession): Promise<PageData> {
    const fb = BiliFallbackEndpoints.find((e) => e.name === pageType);
    if (!fb) throw new Error(`未知兜底端点: ${pageType}`);
    const url = fb.pageUrl.replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(params[k] || ""));
    const selector = pageType === "视频详情" ? ".video-data-container, #video_module" : undefined;
    const { browser, startTime } = await this.fetchPageContent(url, session, ".bilibili.com", selector);
    try {
      await browser.executeScript("window.scrollTo(0, " + (200 + Math.floor(Math.random() * 600)) + ")").catch(() => {});
      await new Promise((r) => setTimeout(r, 500));
      const title = await browser.executeScript<string>("document.title").catch(() => "");
      const bodyText = await browser.executeScript<string>("document.body.innerText.slice(0, 5000)").catch(() => "");
      return {
        url, statusCode: 200,
        body: JSON.stringify({ title, content: bodyText }),
        headers: { "content-type": "application/json;charset=utf-8" },
        responseTime: Date.now() - startTime,
        capturedAt: new Date().toISOString(),
      };
    } finally {
      await browser.close();
    }
  }

  private async fetchSubRepliesForRpid(oid: string, rpid: string, session?: CrawlerSession, maxPages = 5): Promise<{ replies: BiliCommentItem[]; all_count: number; subReplyTime: number }> {
    let allReplies: BiliCommentItem[] = [];
    let totalTime = 0;
    let nextCursor = 0;
    for (let page = 0; page < maxPages; page++) {
      const r = await this.fetchApi("视频子回复", { oid, root: rpid, next: String(nextCursor) }, session);
      const d: { code: number; data?: { replies?: BiliCommentItem[]; cursor?: { is_end?: boolean; next?: number } } } = JSON.parse(r.body);
      totalTime += r.responseTime;
      if (d.code === 0 && d.data?.replies && d.data.replies.length > 0) {
        allReplies = allReplies.concat(d.data.replies);
        if (d.data.cursor?.is_end) break;
        nextCursor = d.data.cursor?.next ?? 0;
      } else break;
    }
    return { replies: allReplies, all_count: allReplies.length, subReplyTime: totalTime };
  }

  async collectUnits(units: string[], params: Record<string, string>, session?: CrawlerSession, _authMode?: string): Promise<UnitResult<unknown>[]> {
    if (params.url) {
      const resolved = resolveBilibiliUrl(params.url);
      for (const [k, v] of Object.entries(resolved)) {
        if (!params[k]) params[k] = v;
      }
      if (params.bvid && !params.aid) {
        try {
          const r = await fetch("https://api.bilibili.com/x/web-interface/view?bvid=" + params.bvid);
          const d = await r.json() as any;
          if (d.data?.aid) params.aid = String(d.data.aid);
          if (d.data?.owner?.mid) params.mid = String(d.data.owner.mid);
        } catch {}
      }
    }
    const results: UnitResult[] = [];

    const dependentUnits = ["bili_video_sub_replies"];
    const independent = units.filter((u) => !dependentUnits.includes(u));
    for (let i = independent.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [independent[i], independent[j]] = [independent[j], independent[i]];
    }
    const shuffled = [...independent];
    for (const u of units) {
      if (dependentUnits.includes(u) && !shuffled.includes(u)) shuffled.push(u);
    }

    for (const unit of shuffled) {
      const start = Date.now();
      try {
        results.push(await this.dispatchUnit(unit, params, session, undefined, results));
      } catch (e: unknown) {
        results.push({ unit, status: "failed", data: null, method: "none", error: e instanceof Error ? e.message : String(e), responseTime: Date.now() - start });
      }
    }
    return results;
  }
}
