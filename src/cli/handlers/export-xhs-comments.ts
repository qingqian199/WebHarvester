import { chromium } from "playwright";
import * as XLSX from "xlsx";
import path from "path";
import fs from "fs";

export async function handleExportXhsComments(): Promise<void> {
  const { default: inq } = await import("inquirer");

  const { noteUrl } = await inq.prompt([{
    type: "input", name: "noteUrl",
    message: "小红书笔记链接（从浏览器地址栏完整复制）：\n  ⚠️ 仅能导出页面默认展示的第一页评论（约10条），全部请用特化爬虫",
    validate: (v: string) => {
      try {
        const u = new URL(v);
        if (!u.pathname.includes("/explore/")) return "必须是 /explore/{note_id} 格式的链接";
        if (!u.searchParams.get("xsec_token")) return "链接缺少 xsec_token 参数（请完整复制浏览器地址栏）";
        return true;
      } catch { return "请输入有效的笔记链接"; }
    },
  }]);

  const parsed = new URL(noteUrl);
  const noteId = parsed.pathname.split("/explore/")[1]?.split("?")[0] || "";
  const _xsecToken = parsed.searchParams.get("xsec_token") || "";
  const _xsecSource = parsed.searchParams.get("xsec_source") || "";
  console.log(`  笔记 ID: ${noteId}`);

  // 尝试连接已有 ChromeService CDP（保留登录态），不可用时自启动
  let page: any;
  let ownBrowser = false;

  try {
    const cdp = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 5000 });
    // 获取已有浏览器上下文（继承用户登录 Cookie）
    const ctx = cdp.contexts()[0] || await cdp.newContext();
    page = await ctx.newPage();
    console.log("🔗 已连接 ChromeService，使用已有登录态");
    // 将已有页面的 Cookie 注入新页面（确保登录态完整）
    try {
      const existingCookies = await ctx.cookies();
      if (existingCookies.length > 0) {
        await ctx.addCookies(existingCookies);
        console.log(`  Cookie 同步完成 (${existingCookies.length} 个)`);
      }
    } catch {}
  } catch {
    ownBrowser = true;
    const { headless } = await inq.prompt([{
      type: "confirm", name: "headless",
      message: "使用无头模式（小红书可能触发验证码，建议选否）？",
      default: false,
    }]);
    const browser = await chromium.launch({ headless });
    const ctx = await browser.newContext();
    page = await ctx.newPage();
  }

  console.log(`\n正在打开笔记页面 ${noteId}...`);

  // 先注册 response 拦截，确保不错过页面的 comment API 调用
  const commentRespQueue: any[] = [];
  page.on("response", (resp: any) => {
    if (resp.url().includes("comment/page") && resp.status() === 200) {
      commentRespQueue.push(resp);
    }
  });

  await page.goto(noteUrl, {
      waitUntil: "domcontentloaded", timeout: 30000,
    });

    // 检测并等待验证码
    const hasCaptcha = await page.waitForSelector(
      ".reds-popup, [class*='captcha'], [class*='verify'], [class*='geetest']",
      { timeout: 5000 },
    ).then(() => true).catch(() => false);

    if (hasCaptcha) {
      console.log("⚠️ 检测到验证码弹窗，请在浏览器窗口中手动完成验证...");
      await page.waitForSelector(
        ".feeds-page, .note-item, .note-scroller, [class*='reds-']",
        { timeout: 120000 },
      ).then(() => console.log("✅ 验证码已通过"))
       .catch(() => console.log("⏰ 验证码等待超时，继续采集"));
    }

  await new Promise((r) => setTimeout(r, 3000));

  // 滚动触发评论区加载
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await new Promise((r) => setTimeout(r, 2000));

  const allRows: any[] = [];
  const fn = (t: string) => (t || "").replace(/[\n\r\t]+/g, " ").trim();

  const extract = (comments: any[]) => {
    for (const c of comments) {
      const u = c.user_info || {};
      allRows.push({ "类型": "评论", "评论ID": String(c.id || ""), "用户": fn(u.nickname || ""), "内容": fn(c.content || ""), "点赞数": c.like_count ?? 0, "发布时间": c.create_time ? new Date(c.create_time * 1000).toISOString().replace("T", " ").slice(0, 19) : "", "回复数": c.sub_comment_count || 0, "父评论ID": "" });
      for (const sr of (c.sub_comments || [])) {
        const su = sr.user_info || {};
        allRows.push({ "类型": "子回复", "评论ID": String(sr.id || ""), "用户": fn(su.nickname || ""), "内容": fn(sr.content || ""), "点赞数": sr.like_count ?? 0, "发布时间": sr.create_time ? new Date(sr.create_time * 1000).toISOString().replace("T", " ").slice(0, 19) : "", "回复数": 0, "父评论ID": String(c.id || "") });
      }
    }
  };

  // 消费队列中的 comment API 响应
  let firstPage = true;
  for (let pageNum = 1; pageNum < 200; pageNum++) {
    let resp: any = null;
    for (let wait = 0; wait < 20 && commentRespQueue.length === 0; wait++) {
      await new Promise((r) => setTimeout(r, 1000));
    }
    resp = commentRespQueue.shift() || null;

    if (!resp) {
      if (firstPage) console.log("  ⚠️ 未检测到评论区（可能页面未加载或评论已关闭）");
      break;
    }
    firstPage = false;
    try {
      const body = await resp.json();
      if (body.code !== 0 || !body.data?.comments?.length) break;
      extract(body.data.comments);
      console.log(`  第 ${pageNum} 页: ${allRows.length} 条`);
      if (!body.data.has_more) break;
      // 小红书页面默认只加载第一页评论，后续需要 API 翻页
      // 尝试点击评论区触发更多加载，或通过 evaluate 触发
      await page.evaluate(() => {
        const el = document.querySelector(".comments-el, .comments-container, .list-container");
        if (el) { el.scrollTop = el.scrollHeight; el.dispatchEvent(new Event("scroll")); }
      });
      await new Promise((r) => setTimeout(r, 2000));
    } catch { break; }
  }

  if (allRows.length > 0) {
    console.log(`\n📝 提示：小红书页面默认只展示第一页评论（当前 ${allRows.length} 条）。`);
    console.log("   如需获取全部评论，请使用 特化采集 → 小红书 → note_comments 单元。");
  }

  // 关闭浏览器（CDP 模式只关 tab，自启模式关整个浏览器）
  if (ownBrowser) {
    const b = page?.context()?.browser();
    if (b) await b.close().catch(() => {});
  } else {
    await page?.close().catch(() => {});
  }

  if (allRows.length === 0) {
    console.log("❌ 未获取到评论\n");
    return;
  }

  const outDir = path.resolve("output", "www_xiaohongshu_com");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `comments-${noteId}-${Date.now()}.xlsx`);

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
