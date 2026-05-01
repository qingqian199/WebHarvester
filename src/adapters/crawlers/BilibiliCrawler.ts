import fetch from "node-fetch";
import { ISiteCrawler, CrawlerSession, PageData, FetchOptions } from "../../core/ports/ISiteCrawler";
import { PlaywrightAdapter } from "../PlaywrightAdapter";
import { ConsoleLogger } from "../ConsoleLogger";
import { RealisticFingerprintProvider } from "../RealisticFingerprintProvider";
import { buildSignedQuery } from "../../utils/crypto/bilibili-signer";
import { UnitResult } from "../../core/models/ContentUnit";

const BILI_DOMAIN = "bilibili.com";
const BILI_API_HOST = "api.bilibili.com";

export interface BiliEndpointDef {
  name: string;
  path: string;
  /** 是否需要 WBI 签名。 */
  needWbi?: boolean;
  /** 默认查询参数。 */
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
  // ✅ 已验证（WBI 签名通过）
  { name: "视频信息", path: "/x/web-interface/wbi/view/detail", needWbi: true, params: "aid=116435892372604", status: "verified" },

  // 🔶 待验证
  { name: "弹幕数据", path: "/x/v2/dm/wbi/web/seg.so", needWbi: true, params: "oid=37660265907&type=1&segment_index=1", status: "sig_pending" },
  { name: "用户空间信息", path: "/x/space/wbi/acc/info", needWbi: true, params: "mid=316627722", status: "sig_pending" },
  { name: "热门搜索", path: "/x/web-interface/wbi/search/default", needWbi: true, params: "", status: "sig_pending" },
];

/**
 * B站（bilibili.com）特化爬虫。
 * 使用 WBI 签名访问需要签名的 API。
 */
export class BilibiliCrawler implements ISiteCrawler {
  readonly name = "bilibili";
  readonly domain = BILI_DOMAIN;
  private readonly fp = new RealisticFingerprintProvider();
  private imgKey = DEFAULT_IMG_KEY;
  private subKey = DEFAULT_SUB_KEY;

  /** 更新 WBI 密钥（从 localStorage 或 nav 接口获取）。 */
  setWbiKeys(imgKey: string, subKey: string): void {
    this.imgKey = imgKey;
    this.subKey = subKey;
  }

  matches(url: string): boolean {
    try {
      return new URL(url).hostname.includes(BILI_DOMAIN);
    } catch {
      return false;
    }
  }

  async fetch(url: string, session?: CrawlerSession, _options?: FetchOptions): Promise<PageData> {
    const cookieStr = (session?.cookies ?? []).map((c) => `${c.name}=${c.value}`).join("; ");
    const fp = this.fp.getFingerprint();

    const headers: Record<string, string> = {
      "User-Agent": fp.userAgent,
      "Accept-Language": fp.acceptLanguage,
      "Accept": "application/json, text/plain, */*",
      "Referer": "https://www.bilibili.com/",
      "Origin": "https://www.bilibili.com",
      ...(cookieStr ? { Cookie: cookieStr } : {}),
    };

    const start = Date.now();
    const res = await fetch(url, { headers });
    const responseTime = Date.now() - start;

    return {
      url: res.url,
      statusCode: res.status,
      body: await res.text(),
      headers: Object.fromEntries(res.headers),
      responseTime,
      capturedAt: new Date().toISOString(),
    };
  }

  async fetchApi(endpointName: string, params?: Record<string, string>, session?: CrawlerSession): Promise<PageData> {
    const ep = BiliApiEndpoints.find((e) => e.name === endpointName);
    if (!ep) throw new Error(`未知端点: ${endpointName}`);

    let query = ep.params || "";
    if (params) {
      // 合并：用 params 覆盖默认参数
      const merged = new URLSearchParams(ep.params || "");
      for (const [k, v] of Object.entries(params)) merged.set(k, v);
      query = merged.toString();
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
    return this.fetch(url, session);
  }

  async fetchPageData(pageType: string, params: Record<string, string>, session?: CrawlerSession): Promise<PageData> {
    const fb = BiliFallbackEndpoints.find((e) => e.name === pageType);
    if (!fb) throw new Error(`未知兜底端点: ${pageType}`);
    const url = fb.pageUrl.replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(params[k] || ""));

    const logger = new ConsoleLogger("info");
    const browser = new PlaywrightAdapter(logger);
    try {
      const startTime = Date.now();
      await browser.launch(url, session ? {
        cookies: session.cookies.map((c) => ({
          name: c.name, value: c.value, domain: c.domain ?? ".bilibili.com",
          path: "/", httpOnly: false, secure: false, sameSite: "Lax" as const,
        })),
        localStorage: {}, sessionStorage: {}, createdAt: Date.now(), lastUsedAt: Date.now(),
      } : undefined);
      await new Promise((r) => setTimeout(r, 3000));
      const title = await browser.executeScript<string>("document.title").catch(() => "");
      const bodyText = await browser.executeScript<string>(
        "document.body.innerText.slice(0, 5000)",
      ).catch(() => "");
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

  async collectUnits(units: string[], params: Record<string, string>, session?: CrawlerSession): Promise<UnitResult[]> {
    const results: UnitResult[] = [];
    for (const unit of units) {
      const start = Date.now();
      try {
        switch (unit) {
          case "bili_video_info": {
            const r = await this.fetchApi("视频信息", { aid: params.aid || "" }, session);
            const d = JSON.parse(r.body);
            results.push({ unit, status: d.code === 0 ? "success" : "partial", data: d, method: "signature", responseTime: r.responseTime });
            break;
          }
          case "bili_search": {
            const r = await this.fetchPageData("B站搜索", { keyword: params.keyword || "" }, session);
            const parsed = JSON.parse(r.body);
            results.push({ unit, status: "success", data: parsed, method: "html_extract", responseTime: r.responseTime });
            break;
          }
          case "bili_user_videos": {
            const r = await this.fetchPageData("用户视频列表", { mid: params.mid || "" }, session);
            const parsed = JSON.parse(r.body);
            results.push({ unit, status: "success", data: parsed, method: "html_extract", responseTime: r.responseTime });
            break;
          }
          default:
            results.push({ unit, status: "failed", data: null, method: "none", error: "未知单元", responseTime: 0 });
        }
      } catch (e: any) {
        results.push({ unit, status: "failed", data: null, method: "none", error: e.message, responseTime: Date.now() - start });
      }
    }
    return results;
  }
}
