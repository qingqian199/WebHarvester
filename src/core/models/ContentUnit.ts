/** 小红书内容单元类型。 */
export type XhsContentUnit =
  | "user_info"
  | "user_posts"
  | "user_board"
  | "note_detail"
  | "search_notes"
  | "note_comments"
  | "note_sub_replies";

/** 知乎内容单元类型。 */
export type ZhihuContentUnit =
  | "zhihu_user_info"
  | "zhihu_search"
  | "zhihu_article"
  | "zhihu_hot_search"
  | "zhihu_comments"
  | "zhihu_sub_replies";

/** TikTok 内容单元类型。 */
export type TtContentUnit =
  | "tt_feed"
  | "tt_video_detail"
  | "tt_user_info"
  | "tt_user_videos"
  | "tt_video_comments"
  | "tt_search"
  | "tt_trending";

/** B站内容单元类型。 */
export type BiliContentUnit =
  | "bili_video_info"
  | "bili_search"
  | "bili_user_videos"
  | "bili_video_comments"
  | "bili_video_sub_replies";

/** BOSS直聘内容单元类型。 */
export type BossContentUnit =
  | "boss_city_list"
  | "boss_city_site"
  | "boss_filter_conditions"
  | "boss_industry_filter"
  | "boss_search"
  | "boss_job_detail";

/** 内容单元配置。 */
export interface ContentUnitDef {
  id: string;
  label: string;
  requiredParams: string[];
  optionalParams?: string[];
  description: string;
}

/** 所有支持的内容单元定义。 */
export const XHS_CONTENT_UNITS: ContentUnitDef[] = [
  { id: "user_info", label: "用户基本信息", requiredParams: ["user_id"], description: "昵称、签名、头像" },
  { id: "user_posts", label: "用户帖子列表", requiredParams: ["user_id"], optionalParams: ["max_pages"], description: "笔记列表" },
  { id: "user_board", label: "用户收藏列表", requiredParams: ["user_id"], description: "收藏夹内容" },
  { id: "note_detail", label: "笔记正文", requiredParams: ["note_id"], description: "标题、正文、图片" },
  { id: "search_notes", label: "搜索笔记", requiredParams: ["keyword"], optionalParams: ["sort", "max_pages"], description: "按关键词搜索笔记（sort: general/time_descending/popularity_descending）" },
  { id: "note_comments", label: "笔记评论", requiredParams: ["note_id"], optionalParams: ["max_pages"], description: "笔记一级评论列表" },
  { id: "note_sub_replies", label: "子回复", requiredParams: ["note_id"], optionalParams: ["root", "max_sub_reply_pages"], description: "自动展开所有一级评论的子回复（无需手动填 root，需同时勾选「笔记评论」）" },
];

export const ZHIHU_CONTENT_UNITS: ContentUnitDef[] = [
  { id: "zhihu_user_info", label: "用户信息", requiredParams: ["member_id"], description: "昵称、签名、数据统计" },
  { id: "zhihu_search", label: "搜索", requiredParams: ["keyword"], optionalParams: ["sort", "max_pages"], description: "搜索内容和用户（sort: time/hot/relevance）" },
  { id: "zhihu_article", label: "文章详情", requiredParams: ["article_id"], description: "标题、正文、作者" },
  { id: "zhihu_hot_search", label: "热门搜索", requiredParams: [], description: "当前热门搜索词" },
  { id: "zhihu_comments", label: "回答评论", requiredParams: ["answer_id"], optionalParams: ["max_pages"], description: "回答的一级评论列表" },
  { id: "zhihu_sub_replies", label: "子回复", requiredParams: ["answer_id"], optionalParams: ["root"], description: "自动展开所有一级评论的子回复（需同时勾选「回答评论」）" },
];

export const TT_CONTENT_UNITS: ContentUnitDef[] = [
  { id: "tt_feed", label: "推荐Feed", requiredParams: [], description: "个性化视频推荐流" },
  { id: "tt_video_detail", label: "视频详情", requiredParams: ["video_id"], optionalParams: ["unique_id"], description: "视频标题、作者、播放数据" },
  { id: "tt_user_info", label: "用户信息", requiredParams: ["unique_id"], description: "用户主页信息" },
  { id: "tt_user_videos", label: "用户视频", requiredParams: ["unique_id"], description: "用户发布的视频列表" },
  { id: "tt_video_comments", label: "视频评论", requiredParams: ["video_id"], description: "视频评论列表" },
  { id: "tt_search", label: "搜索视频", requiredParams: ["keyword"], description: "搜索 TikTok 视频" },
  { id: "tt_trending", label: "热搜趋势", requiredParams: [], description: "当前热门话题与趋势" },
];

export const BILI_CONTENT_UNITS: ContentUnitDef[] = [
  { id: "bili_video_info", label: "视频信息", requiredParams: ["aid"], description: "标题、播放量、UP主" },
  { id: "bili_search", label: "搜索视频", requiredParams: ["keyword"], optionalParams: ["sort", "max_pages"], description: "搜索B站视频（sort: totalrank/click/pubdate/dm/stow）" },
  { id: "bili_user_videos", label: "UP主视频列表", requiredParams: ["mid"], description: "UP主所有视频" },
  { id: "bili_video_comments", label: "视频评论", requiredParams: ["aid"], optionalParams: ["max_pages"], description: "视频一级评论" },
  { id: "bili_video_sub_replies", label: "子回复", requiredParams: ["aid"], optionalParams: ["root", "max_sub_reply_pages"], description: "自动展开所有一级评论的子回复（无需手动填 root，需同时勾选「视频评论」）" },
];

export const BOSS_CONTENT_UNITS: ContentUnitDef[] = [
  { id: "boss_city_list", label: "城市列表", requiredParams: [], description: "所有支持的城市分组" },
  { id: "boss_city_site", label: "城市站点", requiredParams: [], description: "城市站点详细信息" },
  { id: "boss_filter_conditions", label: "职类筛选条件", requiredParams: [], description: "职位分类筛选条件" },
  { id: "boss_industry_filter", label: "行业过滤列表", requiredParams: [], description: "行业免过滤配置" },
  { id: "boss_search", label: "搜索职位", requiredParams: ["keyword"], optionalParams: ["city", "page"], description: "按关键词搜索职位（city: 城市代码）" },
  { id: "boss_job_detail", label: "职位详情", requiredParams: ["jobId"], description: "单个职位的详细信息" },
];

/** 单个单元的采集结果。 */
export interface UnitResult<T = unknown> {
  unit: string;
  status: "success" | "partial" | "failed";
  data: T;
  method: string;
  error?: string;
  responseTime: number;
}
