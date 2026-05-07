const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { chromium } = require("playwright");

const AID = "7630051551511465242";
const OUTPUT = path.resolve(__dirname, "..", "output", "www_douyin_com", "comments-full.xlsx");

function cleanText(t) {
  return (t || "").replace(/[\n\r\t]+/g, " ").trim();
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // 先导航到视频页面建立 session（评论 API 需要同域 cookie）
  await page.goto(`https://www.douyin.com/video/${AID}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await new Promise((r) => setTimeout(r, 5000));
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await new Promise((r) => setTimeout(r, 2000));

  let allComments = [];
  let cursor = "0";
  let hasMore = true;
  let pageNum = 0;

  while (hasMore && pageNum < 121) {
    const url = `https://www.douyin.com/aweme/v1/web/comment/list/?aweme_id=${AID}&cursor=${cursor}&count=20`;
    const raw = await page.evaluate(async (fetchUrl) => {
      try {
        const r = await fetch(fetchUrl);
        const d = await r.json();
        return JSON.stringify({
          ok: true,
          comments: d.comments || [],
          has_more: d.has_more || 0,
          cursor: d.cursor || "0",
          total: d.total || 0,
        });
      } catch (e) {
        return JSON.stringify({ ok: false, error: e.message });
      }
    }, url).catch((e) => JSON.stringify({ ok: false, error: e.message }));

    const data = JSON.parse(raw);
    if (!data.ok) {
      console.log(`fetch 失败: ${data.error}`);
      break;
    }
    if (data.comments.length === 0) break;

    for (const c of data.comments) {
      const user = c.user || {};
      allComments.push({
        "类型": "评论",
        "评论ID": String(c.cid || ""),
        "用户": cleanText(user.nickname || ""),
        "内容": cleanText(c.text || ""),
        "点赞数": c.digg_count ?? 0,
        "发布时间": new Date((c.create_time || 0) * 1000).toISOString().replace("T", " ").slice(0, 19),
        "回复数": c.reply_comment?.total || 0,
        "父评论ID": "",
      });

      const subReplies = c.reply_comment?.comments || [];
      for (const sr of subReplies) {
        const srUser = sr.user || {};
        allComments.push({
          "类型": "子回复",
          "评论ID": String(sr.cid || ""),
          "用户": cleanText(srUser.nickname || ""),
          "内容": cleanText(sr.text || ""),
          "点赞数": sr.digg_count ?? 0,
          "发布时间": new Date((sr.create_time || 0) * 1000).toISOString().replace("T", " ").slice(0, 19),
          "回复数": 0,
          "父评论ID": String(c.cid || ""),
        });
      }
    }

    hasMore = data.has_more === 1;
    cursor = data.cursor || "0";
    pageNum++;
    console.log(`第 ${pageNum} 页: 已获取 ${allComments.length} 条评论 (cursor=${cursor})`);
    await new Promise((r) => setTimeout(r, 500 + Math.random() * 1000));
  }

  await browser.close();

  if (allComments.length === 0) {
    console.log("未获取到评论");
    return;
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(allComments);
  ws["!cols"] = [
    { wch: 8 }, { wch: 22 }, { wch: 16 }, { wch: 60 },
    { wch: 10 }, { wch: 22 }, { wch: 10 }, { wch: 22 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "评论");
  XLSX.writeFile(wb, OUTPUT);
  console.log(`✅ 已导出 ${allComments.length} 条评论到 ${OUTPUT}`);
})().catch((e) => {
  console.error("❌ 失败:", e.message);
  process.exit(1);
});
