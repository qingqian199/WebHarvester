/* eslint-disable @typescript-eslint/no-explicit-any */
import * as XLSX from "xlsx";
import { UnitResult } from "../../core/models/ContentUnit";

function snip(s: unknown, max = 200): string {
  if (!s) return "";
  const str = typeof s === "string" ? s : String(s);
  return str.length > max ? str.slice(0, max) + "..." : str;
}

function fmtTime(ts: number): string {
  if (!ts) return "";
  return new Date(ts * 1000).toLocaleString("zh-CN");
}

function fmtCount(n: unknown): string {
  const v = Number(n) || 0;
  return v >= 10000 ? (v / 10000).toFixed(1) + "万" : String(v);
}

// ── Sheet builders per unit type ──

function sheetBiliVideoInfo(data: any): XLSX.WorkSheet {
  const d = data?.data || data || {};
  // view/detail API 将字段嵌套在 .View 下，需要摊平
  const src = (d.View && typeof d.View === "object" ? d.View : d);
  const s = src?.stat || d?.stat || {};
  const owner = src?.owner || d?.owner || {};
  const rows = [
    ["字段", "值"],
    ["标题", src?.title || d?.title || ""],
    ["播放", fmtCount(s.view)],
    ["点赞", fmtCount(s.like)],
    ["投币", fmtCount(s.coin)],
    ["收藏", fmtCount(s.favorite)],
    ["转发", fmtCount(s.share)],
    ["UP主", owner?.name || ""],
    ["UP主ID", String(owner?.mid || "")],
    ["分区", src?.tname || d?.tname || ""],
    ["发布时间", fmtTime(src?.pubdate || d?.pubdate)],
    ["时长", (src?.duration || d?.duration) ? `${Math.floor((src?.duration || d?.duration) / 60)}:${String((src?.duration || d?.duration) % 60).padStart(2, "0")}` : ""],
    ["简介", snip(src?.desc || d?.desc || "")],
  ];
  return XLSX.utils.aoa_to_sheet(rows);
}

function sheetBiliSearch(data: any): XLSX.WorkSheet {
  const d = data?.data || data;
  const list = (d?.result || d?.videos || []).slice(0, 100);
  const rows = [
    ["序号", "标题", "播放量", "作者", "时长"],
    ...list.map((v: any, i: number) => [
      i + 1,
      (v?.title || "").replace(/<[^>]+>/g, ""),
      fmtCount(v?.play || 0),
      v?.author || "",
      v?.duration || "",
    ]),
  ];
  return XLSX.utils.aoa_to_sheet(rows);
}

function sheetBiliUserVideos(data: any): XLSX.WorkSheet {
  const d = data?.data || data;
  const list = (d?.list?.vlist || d?.videos || []).slice(0, 200);
  const rows = [
    ["序号", "标题", "播放", "评论", "BV号"],
    ...list.map((v: any, i: number) => [
      i + 1,
      v?.title || v?.name || "",
      fmtCount(v?.play || 0),
      v?.comment || 0,
      v?.bvid || "",
    ]),
  ];
  return XLSX.utils.aoa_to_sheet(rows);
}

function sheetBiliComments(data: any): XLSX.WorkSheet {
  const d = data?.data || data;
  const list = d?.replies || [];
  const rows = [
    ["用户名", "评论内容", "点赞", "回复数", "时间", "rpid"],
    ...list.map((r: any) => [
      r?.member?.uname || "",
      snip(r?.content?.message || "", 300),
      fmtCount(r?.like),
      r?.rcount || 0,
      fmtTime(r?.ctime),
      String(r?.rpid || ""),
    ]),
  ];
  return XLSX.utils.aoa_to_sheet(rows);
}

function sheetBiliSubReplies(data: any): XLSX.WorkSheet {
  const d = data?.data || data;
  const comments = d?.comments || {};
  const rows = [
    ["父评论rpid", "用户名", "内容", "点赞", "时间"],
  ];
  for (const [rpid, c] of Object.entries(comments)) {
    const replies = (c as any)?.replies || [];
    for (const r of replies) {
      rows.push([
        rpid,
        r?.member?.uname || "",
        snip(r?.content?.message || "", 300),
        fmtCount(r?.like),
        fmtTime(r?.ctime),
      ]);
    }
  }
  return XLSX.utils.aoa_to_sheet(rows);
}

function sheetKeyValue(data: any, titleKey = "昵称", extraFields: string[] = []): XLSX.WorkSheet {
  const d = data?.data || data || {};
  const rows = [
    ["字段", "值"],
    [titleKey, d?.nickname || d?.nick_name || d?.name || ""],
    ["签名/简介", snip(d?.signature || d?.headline || d?.description || "", 300)],
    ["粉丝", fmtCount(d?.follower_count || 0)],
    ["关注", fmtCount(d?.following_count || 0)],
    ["获赞/喜欢", fmtCount(d?.liked_count || d?.total_liked || 0)],
    ["笔记数/内容数", fmtCount(d?.note_count || d?.answer_count || 0)],
    ...extraFields.map((f) => [f, snip((d as any)[f] || "")]),
  ];
  return XLSX.utils.aoa_to_sheet(rows);
}

function sheetList(data: any, columns: string[], extract: (item: any, i: number) => any[]): XLSX.WorkSheet {
  const d = data?.data || data || {};
  const items = d?.items || d?.notes || d?.entries || d?.results || d?.hot_list || d?.list || [];
  const list = Array.from(items).slice(0, 200);
  const rows = [
    ["序号", ...columns],
    ...list.map((item: any, i: number) => [i + 1, ...extract(item, i)]),
  ];
  return XLSX.utils.aoa_to_sheet(rows);
}

function sheetZhihuArticle(data: any): XLSX.WorkSheet {
  const d = data?.data || data || {};
  const content = (d?.content || d?.body || "").replace(/<[^>]+>/g, "").trim();
  const rows = [
    ["字段", "值"],
    ["标题", d?.title || ""],
    ["作者", d?.author?.name || d?.author || ""],
    ["字数", String(content.length)],
    ["正文预览", snip(content, 500)],
  ];
  return XLSX.utils.aoa_to_sheet(rows);
}

function sheetDouyinComments(data: any): XLSX.WorkSheet {
  const d = data?.data || data;
  const list = d?.comments || [];
  const rows = [
    ["用户名", "评论内容", "点赞数", "发布时间", "评论ID", "回复数"],
    ...list.map((c: any) => [
      c.user?.nickname || "",
      snip(c.text || "", 300),
      fmtCount(c.digg_count || 0),
      c.create_time ? new Date(c.create_time * 1000).toLocaleString("zh-CN") : "",
      String(c.cid || ""),
      c.reply_comment_total || c._subReplyCount || 0,
    ]),
  ];
  return XLSX.utils.aoa_to_sheet(rows);
}

function sheetDouyinSubReplies(data: any): XLSX.WorkSheet {
  const d = data?.data || data;
  const subReplies = d?.sub_replies || {};
  const comments = d?.comments || [];
  const rows = [
    ["父评论ID", "父评论用户", "用户名", "子回复内容", "点赞数", "发布时间", "评论ID"],
  ];
  // 从 sub_replies 字典提取（经过深度翻页展开的）
  for (const [cid, srData] of Object.entries(subReplies)) {
    const replies = (srData as any)?.replies || [];
    for (const sr of replies) {
      rows.push([
        cid,
        "",
        sr.user?.nickname || "",
        snip(sr.text || "", 300),
        fmtCount(sr.digg_count || 0),
        sr.create_time ? new Date(sr.create_time * 1000).toLocaleString("zh-CN") : "",
        String(sr.cid || ""),
      ]);
    }
  }
  // 从 comments 中的 reply_comment（初始嵌入的子回复，未被展开的）
  for (const c of comments) {
    const cid = String(c.cid || "");
    const initial = Array.isArray(c.reply_comment) ? c.reply_comment : [];
    for (const sr of initial) {
      if (subReplies[cid]?.replies?.some((r: any) => r.cid === sr.cid)) continue;
      rows.push([
        cid,
        c.user?.nickname || "",
        sr.user?.nickname || "",
        snip(sr.text || "", 300),
        fmtCount(sr.digg_count || 0),
        sr.create_time ? new Date(sr.create_time * 1000).toLocaleString("zh-CN") : "",
        String(sr.cid || ""),
      ]);
    }
  }
  return rows.length > 1 ? XLSX.utils.aoa_to_sheet(rows) : XLSX.utils.aoa_to_sheet([["父评论ID", "父评论用户", "用户名", "子回复内容", "点赞数", "发布时间", "评论ID"], ["暂无子回复"]]);
}

/** 百度学术：论文搜索结果 + 详情合并表（每行一篇论文，含全部标准字段）。 */
function sheetScholarPapers(data: any): XLSX.WorkSheet {
  const d = data?._searchFallback || (data?.data?.papers) || [];
  if (d.length === 0) return XLSX.utils.aoa_to_sheet([["无论文数据"]]);
  // 标准字段列表（所有行统一，保证每篇论文都有相同的列）
  const FIELDS = [
    "序号", "标题", "作者", "作者单位", "发表年份", "期刊会议",
    "卷", "期", "页码", "摘要", "关键词", "DOI", "被引次数",
    "下载量", "基金项目", "参考文献", "作者邮箱", "导师信息",
    "论文分类号", "原文链接", "备注",
  ];
  const rows: any[][] = [FIELDS];
  d.forEach((p: any, idx: number) => {
    rows.push(FIELDS.map((f) => {
      if (f === "序号") return String(idx + 1);
      const v = p[f];
      if (v == null || v === "") return f === "备注" ? `采集于${new Date().toLocaleDateString("zh-CN")}` : "无";
      if (Array.isArray(v)) return v.join("; ");
      if (typeof v === "string") return v;
      return String(v);
    }));
  });
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = FIELDS.map((f) => {
    if (["标题", "摘要", "参考文献"].includes(f)) return { wch: 50 };
    if (["作者", "作者单位", "关键词", "原文链接"].includes(f)) return { wch: 30 };
    if (f === "序号") return { wch: 6 };
    if (f === "备注") return { wch: 20 };
    return { wch: 14 };
  });
  return sheet;
}

function sheetXhsNoteDetail(data: any): XLSX.WorkSheet {
  const d = data?.data || data || {};
  const note = d?.note_detail_map || d?.note || d;
  const inner = typeof note === "object" && !Array.isArray(note) ? Object.values(note)[0] || note : note;
  const rows = [
    ["字段", "值"],
    ["标题", inner?.title || inner?.display_title || d?.title || ""],
    ["正文", snip(inner?.desc || inner?.description || d?.desc || "", 500)],
    ["图片数", String(Array.from(inner?.image_list || inner?.images || []).length)],
    ["作者", inner?.user?.nickname || inner?.author || d?.author || ""],
  ];
  return XLSX.utils.aoa_to_sheet(rows);
}

export function unitToSheet(unit: string, data: any): { name: string; sheet: XLSX.WorkSheet } {
  const sheetOf = (name: string, fn: () => XLSX.WorkSheet): { name: string; sheet: XLSX.WorkSheet } => {
    try { return { name, sheet: fn() }; } catch { return { name, sheet: XLSX.utils.aoa_to_sheet([["错误", "数据解析失败"]]) }; }
  };

  switch (unit) {
    case "bili_video_info": return sheetOf("视频信息", () => sheetBiliVideoInfo(data));
    case "bili_search": return sheetOf("搜索结果", () => sheetBiliSearch(data));
    case "bili_user_videos": return sheetOf("视频列表", () => sheetBiliUserVideos(data));
    case "bili_video_comments": return sheetOf("评论", () => sheetBiliComments(data));
    case "bili_video_sub_replies": return sheetOf("子回复", () => sheetBiliSubReplies(data));
    case "user_info": return sheetOf("用户信息", () => sheetKeyValue(data));
    case "user_posts": return sheetOf("笔记列表", () => sheetList(data, ["标题", "点赞"], (n) => [snip(n?.display_title || n?.title || n?.note_card?.display_title || "?", 80), fmtCount(n?.liked_count || 0)]));
    case "note_detail": return sheetOf("笔记详情", () => sheetXhsNoteDetail(data));
    case "search_notes": return sheetOf("搜索笔记", () => sheetList(data, ["标题", "点赞"], (n) => { const c = n?.note_card || n; return [snip(c?.display_title || c?.title || "?", 80), fmtCount(c?.liked_count || 0)]; }));
    case "user_board": return sheetOf("收藏列表", () => XLSX.utils.aoa_to_sheet([["数据"], [snip(JSON.stringify(data), 500)]]));
    case "zhihu_user_info": return sheetOf("用户信息", () => sheetKeyValue(data, "昵称", ["answer_count", "articles_count"]));
    case "zhihu_search": return sheetOf("搜索结果", () => sheetList(data, ["标题", "类型", "赞同"], (r) => [snip(r?.title || r?.question?.title || "?", 80), r?.type || "", fmtCount(r?.voteup_count || 0)]));
    case "zhihu_article": return sheetOf("文章", () => sheetZhihuArticle(data));
    case "zhihu_hot_search": return sheetOf("热搜", () => sheetList(data, ["标题", "热度"], (r) => [r?.query || r?.title || r?.display_query || r?.word || "?", fmtCount(r?.heat || r?.hot_score || 0)]));
    case "douyin_video_comments": return sheetOf("抖音评论", () => sheetDouyinComments(data));
    case "douyin_video_sub_replies": return sheetOf("抖音子回复", () => sheetDouyinSubReplies(data));
    case "scholar_search": return sheetOf("学术论文", () => sheetScholarPapers(data));
    case "scholar_paper_detail": return sheetOf("论文详情", () => sheetScholarPapers(data));
    default: return sheetOf(unit, () => XLSX.utils.aoa_to_sheet([["数据"], [snip(JSON.stringify(data), 500)]]));
  }
}

export function exportResultsToXlsx(results: UnitResult[]): Buffer {
  const wb = XLSX.utils.book_new();
  for (const r of results) {
    if (r.status === "failed" || !r.data) continue;
    const { name, sheet } = unitToSheet(r.unit, r.data);
    XLSX.utils.book_append_sheet(wb, sheet, name.slice(0, 31));
  }
  if (wb.SheetNames.length === 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["无数据"]]), "空");
  }
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

export function exportResultsToCsv(results: UnitResult[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of results) {
    if (r.status === "failed" || !r.data) continue;
    const { name, sheet } = unitToSheet(r.unit, r.data);
    out[name] = XLSX.utils.sheet_to_csv(sheet);
  }
  return out;
}
