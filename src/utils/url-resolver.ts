/**
 * URL 意图解析器：从常见的平台 URL 中提取关键 ID。
 * 用于 collectUnits 入口，自动补全参数，减少人工输入。
 */

/** 解析结果 */
export interface ResolvedParams {
  [key: string]: string;
}

/** B站 URL 解析 */
export function resolveBilibiliUrl(url: string): ResolvedParams {
  const params: ResolvedParams = {};
  try {
    const u = new URL(url);
    const path = u.pathname;
    // /video/BV1wN9QBJESj
    const bvMatch = path.match(/\/video\/(BV[a-zA-Z0-9]+)/i);
    if (bvMatch) params.bvid = bvMatch[1];
    // /space/123456
    const midMatch = path.match(/\/space\/(\d+)/);
    if (midMatch) params.mid = midMatch[1];
    // search.bilibili.com/all?keyword=xxx
    const kwMatch = u.searchParams.get("keyword");
    if (kwMatch) params.keyword = kwMatch;
    // /video/BVxxx 也提供 aid？不直接提供，但 bvid 可以后续转 aid
  } catch {}
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
  } catch {}
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
  } catch {}
  return params;
}
