/** 小红书内容单元类型。 */
export type XhsContentUnit =
  | "user_info"
  | "user_posts"
  | "user_board"
  | "note_detail"
  | "search_notes";

/** 内容单元配置。 */
export interface ContentUnitDef {
  id: XhsContentUnit;
  label: string;
  /** 所需参数列表，用于提示用户输入。 */
  requiredParams: string[];
  /** 可选参数。 */
  optionalParams?: string[];
  /** 描述。 */
  description: string;
}

/** 所有支持的内容单元定义。 */
export const XHS_CONTENT_UNITS: ContentUnitDef[] = [
  { id: "user_info", label: "用户基本信息", requiredParams: ["user_id"], description: "昵称、签名、头像" },
  { id: "user_posts", label: "用户帖子列表", requiredParams: ["user_id"], optionalParams: ["max_pages"], description: "笔记列表（自动翻页）" },
  { id: "user_board", label: "用户收藏列表", requiredParams: ["user_id"], description: "收藏夹内容" },
  { id: "note_detail", label: "笔记正文", requiredParams: ["note_id"], description: "标题、正文、图片" },
  { id: "search_notes", label: "搜索笔记", requiredParams: ["keyword"], description: "按关键词搜索笔记" },
];

/** 单个单元的采集结果。 */
export interface UnitResult {
  unit: XhsContentUnit;
  status: "success" | "partial" | "failed";
  data: any;
  /** 采集方式：signature（签名直连）| html_extract（页面提取） */
  method: string;
  error?: string;
  responseTime: number;
}
