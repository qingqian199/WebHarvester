/** 小红书内容单元类型。 */
export type XhsContentUnit =
  | "user_info"
  | "user_posts"
  | "user_board"
  | "note_detail"
  | "search_notes";

/** 知乎内容单元类型。 */
export type ZhihuContentUnit =
  | "zhihu_user_info"
  | "zhihu_search"
  | "zhihu_article"
  | "zhihu_hot_search";

/** B站内容单元类型。 */
export type BiliContentUnit =
  | "bili_video_info"
  | "bili_search"
  | "bili_user_videos";

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
  { id: "search_notes", label: "搜索笔记", requiredParams: ["keyword"], description: "按关键词搜索笔记" },
];

export const ZHIHU_CONTENT_UNITS: ContentUnitDef[] = [
  { id: "zhihu_user_info", label: "用户信息", requiredParams: ["member_id"], description: "昵称、签名、数据统计" },
  { id: "zhihu_search", label: "搜索", requiredParams: ["keyword"], description: "搜索内容和用户" },
  { id: "zhihu_article", label: "文章详情", requiredParams: ["article_id"], description: "标题、正文、作者" },
  { id: "zhihu_hot_search", label: "热门搜索", requiredParams: [], description: "当前热门搜索词" },
];

export const BILI_CONTENT_UNITS: ContentUnitDef[] = [
  { id: "bili_video_info", label: "视频信息", requiredParams: ["aid"], description: "标题、播放量、UP主" },
  { id: "bili_search", label: "搜索视频", requiredParams: ["keyword"], description: "搜索B站视频" },
  { id: "bili_user_videos", label: "UP主视频列表", requiredParams: ["mid"], description: "UP主所有视频" },
  { id: "bili_video_comments", label: "视频评论", requiredParams: ["oid"], description: "视频评论列表" },
];

/** 单个单元的采集结果。 */
export interface UnitResult {
  unit: string;
  status: "success" | "partial" | "failed";
  data: any;
  method: string;
  error?: string;
  responseTime: number;
}
