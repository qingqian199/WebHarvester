import { chromium } from "playwright";
import fs from "fs";
import { XhsCrawler } from "../src/adapters/crawlers/XhsCrawler";

async function main() {
  console.log("正在打开小红书登录页...");
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("https://www.xiaohongshu.com", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);

  console.log("\n========================================");
  console.log("请在浏览器中手动扫码登录小红书");
  console.log("登录后按 Enter 键继续...");
  console.log("========================================");

  // 等待用户确认
  await new Promise<void>((resolve) => {
    process.stdin.once("data", () => resolve());
  });

  // 捕获 session
  const cookies = await ctx.cookies();
  const session = {
    cookies: cookies.map((c) => ({ name: c.name, value: c.value, domain: c.domain })),
    localStorage: {} as Record<string, string>,
  };
  fs.writeFileSync("sessions/xiaohongshu.session.json", JSON.stringify({
    cookies: session.cookies,
    localStorage: session.localStorage,
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
  }, null, 2));
  console.log(`✅ 会话已保存（${cookies.length} 个 Cookie）`);

  await browser.close();

  // 测试 API
  console.log("\n===== 测试 Phase 2 签名 API =====");
  const crawler = new XhsCrawler();
  const searchUrl = "https://edith.xiaohongshu.com/api/sns/web/v1/search/recommend?keyword=%E5%8E%9F%E7%A5%9E";

  const start = Date.now();
  const result = await crawler.fetch(searchUrl, session);
  const cost = Date.now() - start;

  console.log("状态码:", result.statusCode);
  console.log("耗时:", cost, "ms");
  console.log("Content-Type:", result.headers["content-type"]);

  if (result.headers["content-type"]?.includes("json")) {
    const body = JSON.parse(result.body);
    console.log("code:", body.code);

    if (body.code === 0) {
      console.log("✅ Phase 2 签名成功！");
      console.log("数据概览:", JSON.stringify(body.data).slice(0, 500));
      if (body.data?.items) console.log("items 数量:", body.data.items.length);
      if (body.data?.notes) console.log("notes 数量:", body.data.notes.length);
    } else {
      console.log("❌ 错误:", body.msg || body.message || JSON.stringify(body));
    }
  } else {
    console.log("非 JSON 响应:", result.body.slice(0, 300));
  }
}

main().catch(console.error);
