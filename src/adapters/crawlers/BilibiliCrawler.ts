import fetch from "node-fetch";
import { ISiteCrawler, CrawlerSession, PageData, FetchOptions } from "../../core/ports/ISiteCrawler";
import { RealisticFingerprintProvider } from "../RealisticFingerprintProvider";
import { buildSignedQuery } from "../../utils/crypto/bilibili-signer";

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

export const BiliApiEndpoints: ReadonlyArray<BiliEndpointDef> = [
  { name: "视频信息", path: "/x/web-interface/wbi/view/detail", needWbi: true, params: "aid=116435892372604", status: "sig_pending" },
  { name: "弹幕数据", path: "/x/v2/dm/wbi/web/seg.so", needWbi: true, params: "oid=37660265907&type=1&segment_index=1", status: "sig_pending" },
  { name: "用户信息", path: "/x/space/wbi/acc/info", needWbi: true, params: "mid=316627722", status: "sig_pending" },
  { name: "热门搜索", path: "/x/web-interface/wbi/search/default", needWbi: true, params: "", status: "sig_pending" },
  { name: "直播间信息", path: "/xlive/web-room/v1/index/getRoomBaseInfo", needWbi: false, params: "uids=316627722", status: "sig_pending" },
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
}
