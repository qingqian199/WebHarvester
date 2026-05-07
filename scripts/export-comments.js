const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const INPUT = path.resolve(__dirname, "..", "output", "www_douyin_com", "harvest-mos5b2rp_y9ypp0aj.json");
const OUTPUT = path.resolve(__dirname, "..", "output", "www_douyin_com", "comments.xlsx");

function cleanText(t) {
  return (t || "").replace(/[\n\r\t]+/g, " ").trim();
}

const raw = JSON.parse(fs.readFileSync(INPUT, "utf-8"));
const reqs = raw.networkRequests || [];

let rows = [];
for (const r of reqs) {
  if (r.url && r.url.includes("comment/list")) {
    try {
      const body = JSON.parse(r.responseBody);
      const comments = body.comments || [];

      for (const c of comments) {
        const user = c.user || {};
        const createDate = new Date((c.create_time || 0) * 1000);
        const dateStr = createDate.toISOString().replace("T", " ").slice(0, 19);
        const subReplies = c.reply_comment?.comments || [];

        rows.push({
          "类型": "评论",
          "评论ID": String(c.cid || ""),
          "用户": cleanText(user.nickname || ""),
          "内容": cleanText(c.text || ""),
          "点赞数": c.digg_count ?? 0,
          "发布时间": dateStr,
          "回复数": c.reply_comment?.total ?? subReplies.length,
          "父评论ID": "",
        });

        for (const sr of subReplies) {
          const srUser = sr.user || {};
          rows.push({
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
    } catch (e) {
      console.error("解析评论失败:", e.message);
    }
  }
}

if (rows.length === 0) {
  console.log("未找到评论数据");
  process.exit(1);
}

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.json_to_sheet(rows);

// 列宽
ws["!cols"] = [
  { wch: 8 },
  { wch: 22 },
  { wch: 16 },
  { wch: 60 },
  { wch: 10 },
  { wch: 22 },
  { wch: 10 },
  { wch: 22 },
];

XLSX.utils.book_append_sheet(wb, ws, "评论");
XLSX.writeFile(wb, OUTPUT);
console.log(`✅ 已导出 ${rows.length} 条评论到 ${OUTPUT}`);
