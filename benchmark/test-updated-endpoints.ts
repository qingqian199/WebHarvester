import fs from "fs";
import { XhsCrawler } from "../src/adapters/crawlers/XhsCrawler";
import { CrawlerSession } from "../src/core/ports/ISiteCrawler";

async function main() {
  const raw = fs.readFileSync("sessions/xiaohongshu.session.json", "utf-8");
  const d = JSON.parse(raw);
  const session: CrawlerSession = { cookies: d.cookies, localStorage: d.localStorage };
  const c = new XhsCrawler();

  // 先生成一个 search_id
  const searchId = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const requestId = Date.now().toString();

  console.log("search_id:", searchId);
  console.log("request_id:", requestId);

  // 1. 搜索笔记（POST）
  console.log("\n=== 搜索笔记 POST ===");
  const r1 = await c.fetchApi("搜索笔记", {
    keyword: "原神",
    search_id: searchId,
    request_id: requestId,
  }, session);
  const b1 = JSON.parse(r1.body);
  console.log("code:", b1.code, "msg:", b1.msg || "");
  console.log("耗时:", r1.responseTime, "ms");
  if (b1.code === 0 && b1.data?.items) {
    console.log("笔记数:", b1.data.items.length);
    b1.data.items.slice(0, 3).forEach((item: any) => {
      console.log("  -", item.display_title || item.title || item.note_card?.title || "(无标题)");
    });
  } else {
    console.log("响应:", JSON.stringify(b1).slice(0, 300));
  }

  // 2. 搜索一站式（POST）
  console.log("\n=== 搜索一站式 POST ===");
  const r2 = await c.fetchApi("搜索一站式", {
    keyword: "原神",
    search_id: searchId,
    request_id: requestId,
  }, session);
  const b2 = JSON.parse(r2.body);
  console.log("code:", b2.code, "msg:", b2.msg || "");
  if (b2.code === 0) console.log("数据:", JSON.stringify(b2.data).slice(0, 200));

  // 3. 搜索筛选（GET）
  console.log("\n=== 搜索筛选 GET ===");
  const r3 = await c.fetchApi("搜索筛选", { keyword: "原神", search_id: searchId }, session);
  const b3 = JSON.parse(r3.body);
  console.log("code:", b3.code, "msg:", b3.msg || "");
  if (b3.code === 0) console.log("筛选选项:", JSON.stringify(b3.data).slice(0, 200));

  // 4. 未读消息（GET）
  console.log("\n=== 未读消息 GET ===");
  const r4 = await c.fetchApi("未读消息", {}, session);
  const b4 = JSON.parse(r4.body);
  console.log("code:", b4.code, "msg:", b4.msg || "");
  if (b4.code === 0) console.log("数据:", JSON.stringify(b4.data).slice(0, 200));
}

main().catch(console.error);
