export interface FormattedField {
  label: string;
  value: string;
}

export interface FormattedUnit {
  title: string;
  summary: string;
  fields: FormattedField[];
  details: string;
}

function snip(s: unknown, max = 80): string {
  if (!s) return "";
  const str = typeof s === "string" ? s : String(s);
  return str.length > max ? str.slice(0, max) + "..." : str;
}

function fmtTime(ts: unknown): string {
  if (ts == null || ts === 0) return "未知时间";
  const v = typeof ts === "number" ? ts : Number(ts);
  if (Number.isNaN(v)) {
    const d = typeof ts === "string" ? new Date(ts) : new Date(NaN);
    return isNaN(d.getTime()) ? "未知时间" : d.toLocaleDateString("zh-CN") + " " + d.toLocaleTimeString("zh-CN");
  }
  const d = v < 1e12 ? new Date(v * 1000) : new Date(v);
  return isNaN(d.getTime()) ? "未知时间" : d.toLocaleDateString("zh-CN") + " " + d.toLocaleTimeString("zh-CN");
}

function fmtCount(n: unknown): string {
  const v = Number(n) || 0;
  return v >= 10000 ? (v / 10000).toFixed(1) + "万" : String(v);
}

// ── Bilibili ──

function formatBiliVideoInfo(data: any): FormattedUnit {
  const d = data?.data || data;
  // B站 view API 返回 { code: 0, data: { View: { title, stat, owner, ... } } }
  const v = d?.View || d;
  const s = v?.stat || {};
  const owner = v?.owner || {};
  return {
    title: v?.title || "视频信息",
    summary: `${v?.title || "未知标题"} · ${fmtCount(s.view)}播放`,
    fields: [
      { label: "标题", value: snip(v?.title, 120) },
      { label: "播放", value: fmtCount(s.view) },
      { label: "点赞", value: fmtCount(s.like) },
      { label: "投币", value: fmtCount(s.coin) },
      { label: "收藏", value: fmtCount(s.favorite) },
      { label: "转发", value: fmtCount(s.share) },
      { label: "UP主", value: owner?.name || "" },
      { label: "UP mid", value: String(owner?.mid || "") },
      { label: "分区", value: v?.tname || "" },
      { label: "发布时间", value: fmtTime(v?.pubdate) },
      { label: "时长", value: v?.duration ? `${Math.floor(v.duration / 60)}:${String(v.duration % 60).padStart(2, "0")}` : "" },
      { label: "简介", value: snip(v?.desc || v?.desc_v2?.[0]?.text, 200) },
    ],
    details: JSON.stringify(data, null, 2),
  };
}

function formatBiliSearch(data: any): FormattedUnit {
  const d = data?.data || data;
  const results = d?.result || d?.videos || [];
  const list = Array.isArray(results) ? results : [];
  return {
    title: "B站搜索结果",
    summary: `共 ${fmtCount(d?.numResults || d?.total || list.length)} 条结果`,
    fields: [
      { label: "关键词", value: d?.keyword || "" },
      { label: "结果数", value: fmtCount(d?.numResults || d?.total || list.length) },
    ],
    details: list.slice(0, 10).map((v: any, i: number) =>
      `  ${i + 1}. ${v?.title?.replace(/<[^>]+>/g, "") || "?"} — ${fmtCount(v?.play || d?.play)}播放 · ${v?.author || v?.name || ""}`
    ).join("\n") || "（无结果）",
  };
}

function formatBiliUserVideos(data: any): FormattedUnit {
  const d = data?.data || data;
  const vlist = d?.list?.vlist || d?.videos || [];
  const list = Array.from(vlist).slice(0, 15);
  const total = Number(d?.page?.count || d?.total || list.length);
  const name = d?.list?.vlist?.[0]?.author || d?.name || "";
  return {
    title: "UP主视频列表",
    summary: `${name} · ${fmtCount(total)} 个视频`,
    fields: [
      { label: "UP主", value: name },
      { label: "视频总数", value: fmtCount(total) },
    ],
    details: list.length > 0
      ? list.map((v: any, i: number) =>
          `  ${i + 1}. ${snip(v?.title || v?.name || "?", 50)} — ${fmtCount(v?.play || 0)}播放 · ${v?.comment || 0}评论`
        ).join("\n") + (list.length < total ? `\n  ... 还有 ${total - list.length} 个` : "")
      : "（无视频）",
  };
}

function formatBiliComments(data: any): FormattedUnit {
  const d = data?.data || data;
  const replies = d?.replies || [];
  const cursor = d?.cursor || {};
  const total = cursor?.all_count || replies.length;
  const sample = replies.slice(0, 15);
  return {
    title: `视频评论 (${fmtCount(total)} 条)`,
    summary: `共 ${fmtCount(total)} 条一级评论，展示前 ${sample.length} 条`,
    fields: [
      { label: "评论总数", value: fmtCount(total) },
      { label: "本页展示", value: String(sample.length) },
    ],
    details: sample.length > 0
      ? sample.map((r: any) => {
          const uname = r?.member?.uname || "?";
          const msg = snip(r?.content?.message || "", 100);
          const like = fmtCount(r?.like);
          const time = fmtTime(r?.ctime);
          return `  👍 ${like} ${uname} (${time}): ${msg}`;
        }).join("\n")
      : "（暂无评论）",
  };
}

function formatBiliSubReplies(data: any): FormattedUnit {
  const d = data?.data || data;
  const comments = d?.comments || {};
  const total = d?.total_replies || 0;
  const expanded = d?.expanded_count || 0;
  const rpids = Object.keys(comments).slice(0, 8);
  const lines: string[] = [];
  for (const rpid of rpids) {
    const c = comments[rpid];
    const count = c?.all_count || 0;
    const sampleReplies = (c?.replies || []).slice(0, 3);
    lines.push(`  ── 评论 ${rpid}（${count} 条回复）──`);
    for (const r of sampleReplies) {
      const uname = r?.member?.uname || "?";
      const msg = snip(r?.content?.message || "", 80);
      const like = fmtCount(r?.like);
      lines.push(`    ${uname}: ${msg} 👍${like}`);
    }
    if (count > 3) lines.push(`    ... 还有 ${count - 3} 条`);
  }
  return {
    title: `子回复 (${fmtCount(total)} 条, ${expanded} 条评论展开)`,
    summary: `展开 ${expanded} 条评论，共 ${fmtCount(total)} 条子回复`,
    fields: [
      { label: "展开评论数", value: String(expanded) },
      { label: "子回复总数", value: fmtCount(total) },
    ],
    details: lines.join("\n") || "（无子回复）",
  };
}

// ── Xiaohongshu ──

function formatXhsUserInfo(data: any): FormattedUnit {
  const d = data?.data || data || {};
  return {
    title: "用户信息",
    summary: `${d?.nickname || d?.nick_name || "?"} · ${fmtCount(d?.follower_count || 0)}粉丝`,
    fields: [
      { label: "昵称", value: d?.nickname || d?.nick_name || "" },
      { label: "签名", value: snip(d?.signature || d?.desc || "", 200) },
      { label: "粉丝", value: fmtCount(d?.follower_count || 0) },
      { label: "关注", value: fmtCount(d?.following_count || 0) },
      { label: "获赞", value: fmtCount(d?.liked_count || d?.total_liked || 0) },
      { label: "笔记数", value: fmtCount(d?.note_count || 0) },
      { label: "用户ID", value: d?.user_id || d?.userid || "" },
    ],
    details: JSON.stringify(data, null, 2),
  };
}

function formatXhsUserPosts(data: any): FormattedUnit {
  const d = data || {};
  const notes = d?.notes || d?.items || [];
  const list = Array.from(notes).slice(0, 10);
  const total = Number(d?.total || d?.total_count || list.length);
  return {
    title: "用户帖子",
    summary: `共 ${fmtCount(total)} 篇笔记`,
    fields: [
      { label: "笔记总数", value: fmtCount(total) },
    ],
    details: list.length > 0
      ? list.map((n: any, i: number) =>
          `  ${i + 1}. ${snip(n?.display_title || n?.title || n?.note_card?.display_title || "?", 60)}` +
          (n?.liked_count ? ` ❤️${fmtCount(n.liked_count)}` : "") +
          (n?.collected_count ? ` ⭐${fmtCount(n.collected_count)}` : "")
        ).join("\n")
      : "（无笔记）",
  };
}

function formatXhsNoteDetail(data: any): FormattedUnit {
  const d = data?.data || data || {};
  const note = d?.note_detail_map || d?.note || d;
  const inner = typeof note === "object" && !Array.isArray(note) ? Object.values(note)[0] || note : note;
  const title = inner?.title || inner?.display_title || d?.title || "";
  const desc = inner?.desc || inner?.description || d?.desc || "";
  const images = inner?.image_list || inner?.images || [];
  return {
    title: "笔记详情",
    summary: `${snip(title, 60)} · ${images.length} 张图片`,
    fields: [
      { label: "标题", value: snip(title, 120) },
      { label: "正文", value: snip(desc, 300) },
      { label: "图片数", value: String(Array.from(images).length) },
      { label: "作者", value: inner?.user?.nickname || inner?.author || d?.author || "" },
    ],
    details: JSON.stringify(inner, null, 2).slice(0, 2000),
  };
}

function formatXhsSearchNotes(data: any): FormattedUnit {
  const d = data || {};
  const items = d?.items || d?.data || [];
  const list = Array.from(items).slice(0, 10);
  const total = d?.total_count || list.length;
  return {
    title: "搜索笔记",
    summary: `共 ${fmtCount(total)} 条结果`,
    fields: [
      { label: "结果数", value: fmtCount(total) },
    ],
    details: list.length > 0
      ? list.map((n: any, i: number) => {
          const note = n?.note_card || n;
          return `  ${i + 1}. ${snip(note?.display_title || note?.title || "?", 60)}` +
            (note?.liked_count ? ` ❤️${fmtCount(note.liked_count)}` : "");
        }).join("\n")
      : "（无结果）",
  };
}

// ── Zhihu ──

function formatZhihuUserInfo(data: any): FormattedUnit {
  const d = data?.data || data || {};
  return {
    title: "知乎用户信息",
    summary: `${d?.name || "?"} · ${fmtCount(d?.follower_count || 0)}关注者`,
    fields: [
      { label: "昵称", value: d?.name || "" },
      { label: "简介", value: snip(d?.headline || d?.description || "", 200) },
      { label: "关注者", value: fmtCount(d?.follower_count || 0) },
      { label: "回答数", value: fmtCount(d?.answer_count || 0) },
      { label: "文章数", value: fmtCount(d?.articles_count || 0) },
      { label: "想法数", value: fmtCount(d?.pin_count || 0) },
      { label: "性别", value: d?.gender === 1 ? "男" : d?.gender === 0 ? "女" : "" },
      { label: "位置", value: d?.locations?.[0]?.name || "" },
    ],
    details: JSON.stringify(data, null, 2),
  };
}

function formatZhihuSearch(data: any): FormattedUnit {
  const d = data?.data || data || {};
  const entries = d?.entries || d?.results || [];
  const list = Array.from(entries).slice(0, 10);
  const total = d?.total_count || list.length;
  return {
    title: "知乎搜索",
    summary: `共 ${fmtCount(total)} 条结果`,
    fields: [
      { label: "关键词", value: d?.keyword || d?.query || "" },
      { label: "结果数", value: fmtCount(total) },
    ],
    details: list.length > 0
      ? list.map((r: any, i: number) => {
          const title = snip(r?.title || r?.question?.title || "?", 60);
          const type = r?.type || "";
          const vote = r?.voteup_count || r?.vote_count || "";
          return `  ${i + 1}. [${type}] ${title}${vote ? ` 👍${fmtCount(vote)}` : ""}`;
        }).join("\n")
      : "（无结果）",
  };
}

function formatZhihuArticle(data: any): FormattedUnit {
  const d = data?.data || data || {};
  const title = d?.title || "";
  const content = d?.content || d?.body || "";
  const plain = content.replace(/<[^>]+>/g, "").trim();
  return {
    title: "知乎文章",
    summary: `${snip(title, 60)} · ${Math.floor(plain.length / 100)} 百字`,
    fields: [
      { label: "标题", value: snip(title, 120) },
      { label: "作者", value: d?.author?.name || d?.author || "" },
      { label: "字数", value: String(plain.length) },
      { label: "正文预览", value: snip(plain, 500) },
    ],
    details: plain.slice(0, 3000),
  };
}

function formatZhihuHotSearch(data: any): FormattedUnit {
  const d = data?.data || data || {};
  const list = Array.isArray(d) ? d : d?.hot_list || d?.list || d?.results || [];
  const items = Array.from(list).slice(0, 20);
  return {
    title: "知乎热搜",
    summary: `共 ${items.length} 条热搜`,
    fields: [],
    details: items.length > 0
      ? items.map((r: any, i: number) => {
          const title = r?.query || r?.title || r?.display_query || r?.word || "?";
          const heat = r?.heat || r?.hot_score || r?.count || "";
          return `  ${i + 1}. ${snip(title, 60)}${heat ? ` 🔥${fmtCount(heat)}` : ""}`;
        }).join("\n")
      : "（无热搜）",
  };
}

// ── Dispatcher ──

export function formatUnitResult(unit: string, data: any): FormattedUnit {
  const fallback = (): FormattedUnit => ({
    title: unit,
    summary: snip(JSON.stringify(data), 120),
    fields: [],
    details: JSON.stringify(data, null, 2),
  });
  try {
    switch (unit) {
      // Bilibili
      case "bili_video_info": return formatBiliVideoInfo(data);
      case "bili_search": return formatBiliSearch(data);
      case "bili_user_videos": return formatBiliUserVideos(data);
      case "bili_video_comments": return formatBiliComments(data);
      case "bili_video_sub_replies": return formatBiliSubReplies(data);
      // Xiaohongshu
      case "user_info": return formatXhsUserInfo(data);
      case "user_posts": return formatXhsUserPosts(data);
      case "note_detail": return formatXhsNoteDetail(data);
      case "search_notes": return formatXhsSearchNotes(data);
      case "user_board":
        return { title: "收藏列表", summary: snip(JSON.stringify(data), 120), fields: [], details: JSON.stringify(data, null, 2) };
      // Zhihu
      case "zhihu_user_info": return formatZhihuUserInfo(data);
      case "zhihu_search": return formatZhihuSearch(data);
      case "zhihu_article": return formatZhihuArticle(data);
      case "zhihu_hot_search": return formatZhihuHotSearch(data);
      default: return fallback();
    }
  } catch {
    return fallback();
  }
  return fallback();
}

export function formatUnitResults(results: Array<{ unit: string; data: any; status: string; method?: string; responseTime?: number; error?: string }>): string {
  return results.map((r, i) => {
    const icon = r.status === "success" ? "✅" : r.status === "partial" ? "⚠️" : "❌";
    const mIcon = r.method === "signature" ? "🔵" : r.method === "html_extract" ? "🟠" : "⚪";
    const time = r.responseTime ? `${r.responseTime}ms` : "";
    const formatted = r.data ? formatUnitResult(r.unit, r.data) : null;
    const lines: string[] = [];
    lines.push(`─── ${i + 1}. ${icon} ${formatted?.title || r.unit} ${mIcon} ${time} ───`);
    if (formatted) {
      if (formatted.summary) lines.push(`  📝 ${formatted.summary}`);
      for (const f of formatted.fields) {
        if (f.value) lines.push(`  ${f.label}: ${f.value}`);
      }
      if (formatted.details && formatted.details.length < 500) {
        lines.push(`  ${formatted.details}`);
      } else if (formatted.details) {
        lines.push(`  ${formatted.details.slice(0, 300)}...`);
      }
    }
    if (r.error) lines.push(`  ⚠️ ${r.error}`);
    return lines.join("\n");
  }).join("\n\n");
}
