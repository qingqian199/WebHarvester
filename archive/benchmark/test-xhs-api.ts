import fs from "fs";
import { XhsCrawler } from "../src/adapters/crawlers/XhsCrawler";
import { CrawlerSession } from "../src/core/ports/ISiteCrawler";

async function main() {
  const sessionRaw = fs.readFileSync("sessions/xiaohongshu.session.json", "utf-8");
  const sessionData = JSON.parse(sessionRaw);
  const session: CrawlerSession = {
    cookies: sessionData.cookies,
    localStorage: sessionData.localStorage,
  };

  const crawler = new XhsCrawler();

  // 搜索 API
  const searchUrl =
    "https://edith.xiaohongshu.com/api/sns/web/v1/search/recommend?keyword=%25E5%258E%259F%25E7%25A5%259E&source=web_explore_feed&type=51";

  console.log("===== 搜索 API =====");
  let result = await crawler.fetch(searchUrl, session);
  console.log("状态码:", result.statusCode);
  console.log("耗时:", result.responseTime, "ms");
  console.log("Content-Type:", result.headers["content-type"]);
  console.log("X-s:", result.headers["x-s"]?.slice(0, 60) + "...");
  console.log("X-t:", result.headers["x-t"]);

  if (result.headers["content-type"]?.includes("json")) {
    const body = JSON.parse(result.body);
    console.log("code:", body.code, "/ msg:", body.msg || body.message);
    console.log("data keys:", Object.keys(body.data || {}).slice(0, 10));
    if (body.data?.items) console.log("items:", body.data.items.length);
    if (body.data?.notes) console.log("notes:", body.data.notes.length);
    if (body.code !== 0) console.log("错误详情:", JSON.stringify(body).slice(0, 500));
  } else {
    console.log("非 JSON, 前500:", result.body.slice(0, 500));
  }

  // 用户信息 API
  console.log("\n===== 用户信息 API =====");
  const meUrl = "https://edith.xiaohongshu.com/api/sns/web/v2/user/me";
  result = await crawler.fetch(meUrl, session);
  console.log("状态码:", result.statusCode);
  console.log("Content-Type:", result.headers["content-type"]);
  if (result.headers["content-type"]?.includes("json")) {
    const body = JSON.parse(result.body);
    console.log("code:", body.code, "/ msg:", body.msg || body.message);
    console.log("用户信息:", JSON.stringify(body.data).slice(0, 300));
  } else {
    console.log("非 JSON, 前500:", result.body.slice(0, 500));
  }
}

main().catch(console.error);
