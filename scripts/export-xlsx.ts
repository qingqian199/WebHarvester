/**
 * 将采集结果 JSON 导出为 Excel (.xlsx)。
 *
 * 用法: npx ts-node scripts/export-xlsx.ts <harvest-*.json> [输出文件名]
 */
import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";

function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("用法: npx ts-node scripts/export-xlsx.ts <harvest-*.json> [输出文件名]");
    process.exit(1);
  }

  const raw = fs.readFileSync(path.resolve(filePath), "utf-8");
  const data = JSON.parse(raw);

  // 支持两种格式：组合采集（数组）和普通采集（对象）
  const results = Array.isArray(data) ? data : [data];

  const wb = XLSX.utils.book_new();

  for (const result of results) {
    const sheetName = (result.unit || result.traceId || "result").slice(0, 31);
    const rows: Record<string, any>[] = [];

    const content = result.data || result;

    // 视频信息
    if (content.code === 0 && content.data?.View) {
      const v = content.data.View;
      const s = v.stat || {};
      rows.push({ 类别: "视频信息", 字段: "标题", 值: v.title });
      rows.push({ 类别: "视频信息", 字段: "UP主", 值: v.owner?.name });
      rows.push({ 类别: "视频信息", 字段: "UP主ID", 值: v.owner?.mid });
      rows.push({ 类别: "视频信息", 字段: "BVID", 值: v.bvid });
      rows.push({ 类别: "视频信息", 字段: "AID", 值: v.aid });
      rows.push({ 类别: "视频信息", 字段: "播放", 值: s.view });
      rows.push({ 类别: "视频信息", 字段: "弹幕", 值: s.danmaku });
      rows.push({ 类别: "视频信息", 字段: "点赞", 值: s.like });
      rows.push({ 类别: "视频信息", 字段: "硬币", 值: s.coin });
      rows.push({ 类别: "视频信息", 字段: "收藏", 值: s.favorite });
      rows.push({ 类别: "视频信息", 字段: "转发", 值: s.share });
      rows.push({ 类别: "视频信息", 字段: "评论数", 值: s.reply });
      rows.push({ 类别: "视频信息", 字段: "描述", 值: v.desc });
      rows.push({ 类别: "视频信息", 字段: "时长(秒)", 值: v.duration });
      rows.push({ 类别: "视频信息", 字段: "发布时间", 值: v.pubdate ? new Date(v.pubdate * 1000).toLocaleString() : "" });
    }

    // 评论
    if (content.data?.replies) {
      content.data.replies.forEach((reply: any, i: number) => {
        rows.push({
          类别: "评论",
          字段: `#${i + 1}`,
          值: `${reply.member?.uname || "匿名"}: ${(reply.content?.message || "").slice(0, 200)}`,
          点赞: reply.like,
          时间: reply.ctime ? new Date(reply.ctime * 1000).toLocaleString() : "",
        });
      });
    }

    // 搜索或页面提取结果
    if (content.title) {
      rows.push({ 类别: "页面", 字段: "标题", 值: content.title });
      if (content.content) rows.push({ 类别: "页面", 字段: "内容", 值: content.content.slice(0, 500) });
    }

    if (rows.length > 0) {
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    }
  }

  const outName = process.argv[3] || filePath.replace(/\.json$/i, "") + ".xlsx";
  XLSX.writeFile(wb, outName);
  console.log(`✅ 已导出: ${outName}`);
}

main();
