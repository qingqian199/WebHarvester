import { chromium } from "playwright";
import * as XLSX from "xlsx";
import path from "path";
import fs from "fs";

export async function handleExportComments(): Promise<void> {
  const { default: inq } = await import("inquirer");

  const { awemeId } = await inq.prompt([{
    type: "input", name: "awemeId",
    message: "抖音视频 ID (aweme_id / modal_id)：",
    validate: (v: string) => v.trim().length > 0 ? true : "请输入视频 ID",
  }]);

  const { headless } = await inq.prompt([{
    type: "confirm", name: "headless",
    message: "使用无头模式（后台静默运行）？",
    default: true,
  }]);

  const browser = await chromium.launch({ headless });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  console.log(`\n正在打开视频页面 ${awemeId}...`);
  await page.goto(`https://www.douyin.com/video/${awemeId}`, {
    waitUntil: "domcontentloaded", timeout: 30000,
  });
  await new Promise((r) => setTimeout(r, 5000));
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await new Promise((r) => setTimeout(r, 2000));

  const allRows: any[] = [];
  let cursor = "0";
  let hasMore = true;
  let pageNum = 0;

  while (hasMore && pageNum < 200) {
    const url = `https://www.douyin.com/aweme/v1/web/comment/list/?aweme_id=${awemeId}&cursor=${cursor}&count=20`;
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
        return JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }, url).catch((e) => JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }));

    const data = JSON.parse(raw);
    if (!data.ok) {
      console.log(`  ⚠️ 第 ${pageNum + 1} 页获取失败: ${data.error}`);
      break;
    }
    if (data.comments.length === 0) {
      console.log("  已无更多评论");
      break;
    }

    const fn = (t: string) => (t || "").replace(/[\n\r\t]+/g, " ").trim();
    for (const c of data.comments) {
      const user = c.user || {};
      allRows.push({
        "类型": "评论", "评论ID": String(c.cid || ""),
        "用户": fn(user.nickname || ""), "内容": fn(c.text || ""),
        "点赞数": c.digg_count ?? 0,
        "发布时间": new Date((c.create_time || 0) * 1000).toISOString().replace("T", " ").slice(0, 19),
        "回复数": c.reply_comment?.total || 0, "父评论ID": "",
      });
      for (const sr of (c.reply_comment?.comments || [])) {
        const su = sr.user || {};
        allRows.push({
          "类型": "子回复", "评论ID": String(sr.cid || ""),
          "用户": fn(su.nickname || ""), "内容": fn(sr.text || ""),
          "点赞数": sr.digg_count ?? 0,
          "发布时间": new Date((sr.create_time || 0) * 1000).toISOString().replace("T", " ").slice(0, 19),
          "回复数": 0, "父评论ID": String(c.cid || ""),
        });
      }
    }

    hasMore = data.has_more === 1;
    cursor = data.cursor || "0";
    pageNum++;
    console.log(`  第 ${pageNum} 页: ${allRows.length} 条`);
    await new Promise((r) => setTimeout(r, 500 + Math.random() * 1000));
  }

  await browser.close();

  if (allRows.length === 0) {
    console.log("❌ 未获取到评论\n");
    return;
  }

  const outDir = path.resolve("output", "www_douyin_com");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `comments-${awemeId}-${Date.now()}.xlsx`);

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(allRows);
  ws["!cols"] = [
    { wch: 8 }, { wch: 22 }, { wch: 16 }, { wch: 60 },
    { wch: 10 }, { wch: 22 }, { wch: 10 }, { wch: 22 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "评论");
  XLSX.writeFile(wb, outFile);

  console.log(`\n✅ 共 ${allRows.length} 条评论 → ${outFile}\n`);
}
