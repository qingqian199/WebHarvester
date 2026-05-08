/**
 * URL 意图解析器：从常见的平台 URL 中提取关键 ID。
 * 用于 collectUnits 入口，自动补全参数，减少人工输入。
 */

/** 解析结果 */
import { ConsoleLogger } from "../adapters/ConsoleLogger";

const urlLogger = new ConsoleLogger("warn");

export interface ResolvedParams {
  [key: string]: string;
}

/** B站 URL 解析 */
export function resolveBilibiliUrl(url: string): ResolvedParams {
  const params: ResolvedParams = {};
  try {
    const u = new URL(url);
    const path = u.pathname;
    const bvMatch = path.match(/\/video\/(BV[a-zA-Z0-9]+)/i);
    if (bvMatch) params.bvid = bvMatch[1];
    const midMatch = path.match(/\/space\/(\d+)/);
    if (midMatch) params.mid = midMatch[1];
    const kwMatch = u.searchParams.get("keyword");
    if (kwMatch) params.keyword = kwMatch;
  } catch { urlLogger.warn("resolveBilibiliUrl: 解析失败", { url }); }
  return params;
}

/** 知乎 URL 解析 */
export function resolveZhihuUrl(url: string): ResolvedParams {
  const params: ResolvedParams = {};
  try {
    const u = new URL(url);
    const path = u.pathname;
    // zhuanlan.zhihu.com/p/123456
    const articleMatch = path.match(/\/p\/(\d+)/);
    if (articleMatch) params.article_id = articleMatch[1];
    // www.zhihu.com/people/xxx
    const peopleMatch = path.match(/\/people\/([^/]+)/);
    if (peopleMatch) params.member_id = peopleMatch[1];
    // www.zhihu.com/search?q=xxx
    const qMatch = u.searchParams.get("q") || u.searchParams.get("keyword");
    if (qMatch) params.keyword = qMatch;
  } catch { urlLogger.warn("resolveZhihuUrl: 解析失败", { url }); }
  return params;
}

/** 小红书 URL 解析 */
export function resolveXiaohongshuUrl(url: string): ResolvedParams {
  const params: ResolvedParams = {};
  try {
    const u = new URL(url);
    const path = u.pathname;
    // /user/profile/xxxx
    const profileMatch = path.match(/\/user\/profile\/([^/]+)/);
    if (profileMatch) params.user_id = profileMatch[1];
    // /explore/xxxx 或 /discovery/item/xxxx
    const noteMatch = path.match(/\/(?:explore|discovery\/item)\/([^/]+)/);
    if (noteMatch) params.note_id = noteMatch[1];
    // /search_result?keyword=xxx
    const kwMatch = u.searchParams.get("keyword");
    if (kwMatch) params.keyword = kwMatch;
  } catch { urlLogger.warn("resolveXiaohongshuUrl: 解析失败", { url }); }
  return params;
}

/** TikTok URL 解析 */
export function resolveTikTokUrl(url: string): ResolvedParams {
  const params: ResolvedParams = {};
  try {
    const u = new URL(url);
    const path = u.pathname;
    const videoMatch = path.match(/\/@([^/]+)\/video\/(\d+)/);
    if (videoMatch) { params.unique_id = videoMatch[1]; params.video_id = videoMatch[2]; }
    const userMatch = path.match(/\/@([^/]+)/);
    if (userMatch && !params.unique_id) params.unique_id = userMatch[1];
    const qMatch = u.searchParams.get("q") || u.searchParams.get("keyword");
    if (qMatch) params.keyword = qMatch;
  } catch { urlLogger.warn("resolveTikTokUrl: 解析失败", { url }); }
  return params;
}

/** 抖音 URL 解析 */
export function resolveDouyinUrl(url: string): ResolvedParams {
  const params: ResolvedParams = {};
  try {
    const u = new URL(url);
    const path = u.pathname;
    // /video/{aweme_id}
    const videoMatch = path.match(/\/video\/(\d+)/);
    if (videoMatch) params.aweme_id = videoMatch[1];
    // /user/{sec_uid}
    const userMatch = path.match(/\/user\/([A-Za-z0-9_-]+)/);
    if (userMatch) params.sec_user_id = userMatch[1];
    // jingxuan?modal_id={id}
    const modalId = u.searchParams.get("modal_id");
    if (modalId && !params.aweme_id) params.aweme_id = modalId;
    // search?q=xxx or ?keyword=xxx
    const qMatch = u.searchParams.get("q") || u.searchParams.get("keyword");
    if (qMatch) params.keyword = qMatch;
  } catch { urlLogger.warn("resolveDouyinUrl: 解析失败", { url }); }
  return params;
}
