// ── Bilibili ──

export interface BiliVideoInfo {
  code: number;
  data: {
    title: string;
    desc: string;
    pubdate: number;
    duration: number;
    tname: string;
    owner: { name: string; mid: number };
    stat: { view: number; like: number; coin: number; favorite: number; share: number };
    // View/detail 端点的附加字段
    tags?: Array<{ tag_id: number; tag_name: string; [key: string]: unknown }>;
    relates?: Array<Record<string, unknown>>;
    season_id?: number;
    season?: Record<string, unknown>;
    ugc_season?: Record<string, unknown>;
    honor_reply?: Record<string, unknown>;
    activity?: Record<string, unknown>;
    activity_season?: Record<string, unknown>;
    player_info?: Record<string, unknown>;
    rcmd_reason?: Record<string, unknown>;
    [key: string]: unknown;
  };
}

export interface BiliSearchResult {
  code: number;
  data: {
    keyword?: string;
    numResults?: number;
    total?: number;
    result?: Array<{ title: string; play?: number; author?: string; duration?: string; [key: string]: unknown }>;
    videos?: Array<{ title: string; play?: number; author?: string; [key: string]: unknown }>;
    [key: string]: unknown;
  };
}

export interface BiliUserVideo {
  title?: string;
  name?: string;
  play?: number;
  comment?: number;
  bvid?: string;
  author?: string;
  [key: string]: unknown;
}

export interface BiliUserVideos {
  code: number;
  data: {
    list?: { vlist: BiliUserVideo[]; author?: string };
    videos?: BiliUserVideo[];
    page?: { count: number };
    total?: number;
    name?: string;
    [key: string]: unknown;
  };
}

export interface CommentAuthor {
  name: string;
  id?: string | number;
  avatar?: string;
  level?: number;
  fans?: number;
  [key: string]: unknown;
}

export interface BiliCommentItem {
  rpid: number;
  member: { uname: string; [key: string]: unknown };
  content: { message: string; [key: string]: unknown };
  like: number;
  rcount: number;
  ctime: number;
  replies?: BiliCommentItem[];
  type?: "main" | "sub";
  parent_rpid?: number;
  [key: string]: unknown;
}

export interface BiliComments {
  code: number;
  data: {
    replies: BiliCommentItem[];
    cursor?: { all_count: number; is_end?: boolean; next?: number; [key: string]: unknown };
    [key: string]: unknown;
  };
}

export interface BiliSubReplyGroup {
  replies: BiliCommentItem[];
  all_count: number;
}

export interface BiliSubReplies {
  code: number;
  data: {
    comments: Record<string, BiliSubReplyGroup>;
    total_replies: number;
    expanded_count: number;
    [key: string]: unknown;
  };
}

// ── Xiaohongshu ──

export interface XhsUserInfo {
  data?: {
    nickname?: string;
    nick_name?: string;
    signature?: string;
    desc?: string;
    follower_count?: number;
    following_count?: number;
    liked_count?: number;
    total_liked?: number;
    note_count?: number;
    user_id?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface XhsNoteItem {
  display_title?: string;
  title?: string;
  liked_count?: number;
  collected_count?: number;
  note_card?: { display_title?: string; title?: string; liked_count?: number; [key: string]: unknown };
  [key: string]: unknown;
}

export interface XhsUserPosts {
  notes?: XhsNoteItem[];
  items?: XhsNoteItem[];
  total?: number;
  total_count?: number;
  [key: string]: unknown;
}

export interface XhsNoteDetail {
  data?: Record<string, unknown>;
  note_detail_map?: Record<string, unknown>;
  note?: Record<string, unknown>;
  desc?: string;
  title?: string;
  [key: string]: unknown;
}

export interface XhsSearchNotes {
  items?: XhsNoteItem[];
  data?: XhsNoteItem[];
  total_count?: number;
  [key: string]: unknown;
}

export interface XhsCommentItem {
  id?: string;
  user_info?: { nickname?: string; user_id?: string; avatar?: string; [key: string]: unknown };
  content?: string;
  like_count?: number;
  create_time?: number;
  sub_comment_count?: number;
  [key: string]: unknown;
}

export interface XhsComments {
  code?: number;
  data?: {
    comments?: XhsCommentItem[];
    cursor?: { next?: string; is_end?: boolean; all_count?: number; [key: string]: unknown };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

// ── Zhihu ──

export interface ZhihuUserInfo {
  data?: {
    name?: string;
    headline?: string;
    description?: string;
    follower_count?: number;
    answer_count?: number;
    articles_count?: number;
    pin_count?: number;
    gender?: number;
    locations?: Array<{ name: string }>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface ZhihuSearchItem {
  title?: string;
  type?: string;
  voteup_count?: number;
  vote_count?: number;
  question?: { title?: string; [key: string]: unknown };
  [key: string]: unknown;
}

export interface ZhihuSearch {
  data?: {
    entries?: ZhihuSearchItem[];
    results?: ZhihuSearchItem[];
    total_count?: number;
    keyword?: string;
    query?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface ZhihuArticle {
  data?: {
    title?: string;
    content?: string;
    body?: string;
    author?: { name?: string; [key: string]: unknown };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface ZhihuHotEntry {
  query?: string;
  title?: string;
  display_query?: string;
  word?: string;
  heat?: number;
  hot_score?: number;
  count?: number;
  [key: string]: unknown;
}

export interface ZhihuCommentItem {
  id?: number;
  content?: string;
  author?: { name?: string; url?: string; avatar?: string; [key: string]: unknown };
  vote_count?: number;
  created_time?: number;
  child_count?: number;
  [key: string]: unknown;
}

export interface ZhihuComments {
  data?: ZhihuCommentItem[];
  paging?: { next?: string; is_end?: boolean; totals?: number; [key: string]: unknown };
  [key: string]: unknown;
}

export interface ZhihuHotSearch {
  data?: {
    hot_list?: ZhihuHotEntry[];
    list?: ZhihuHotEntry[];
    results?: ZhihuHotEntry[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

// ── TikTok ──

export interface TtFeedData {
  status_code?: number;
  itemList?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface TtVideoDetail {
  status_code?: number;
  itemInfo?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface TtUserInfo {
  status_code?: number;
  user?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface TtUserVideos {
  status_code?: number;
  itemList?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

// ── Unit type map ──

export interface CrawlerUnitDataMap {
  // Bilibili
  bili_video_info: BiliVideoInfo;
  bili_search: BiliSearchResult;
  bili_user_videos: BiliUserVideos;
  bili_video_comments: BiliComments;
  bili_video_sub_replies: BiliSubReplies;
  // Xiaohongshu
  user_info: XhsUserInfo;
  user_posts: XhsUserPosts;
  note_detail: XhsNoteDetail;
  search_notes: XhsSearchNotes;
  user_board: Record<string, unknown>;
  note_comments: XhsComments;
  note_sub_replies: Record<string, unknown>;
  // Zhihu
  zhihu_user_info: ZhihuUserInfo;
  zhihu_search: ZhihuSearch;
  zhihu_article: ZhihuArticle;
  zhihu_hot_search: ZhihuHotSearch;
  zhihu_comments: ZhihuComments;
  zhihu_sub_replies: Record<string, unknown>;
  // TikTok
  tt_feed: TtFeedData;
  tt_video_detail: TtVideoDetail;
  tt_user_info: TtUserInfo;
  tt_user_videos: TtUserVideos;
  tt_video_comments: Record<string, unknown>;
  // Fallback
  [key: string]: unknown;
}
