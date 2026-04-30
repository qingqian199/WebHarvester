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

  const tests = [
    { name: "推荐笔记 feed", method: "GET", url: "https://edith.xiaohongshu.com/api/sns/web/v1/feed?category_id=homefeed_recommend&num=3" },
    { name: "推荐笔记 feed v2", method: "GET", url: "https://edith.xiaohongshu.com/api/sns/web/v2/feed?category_id=homefeed_recommend&num=3" },
    { name: "首页 feed", method: "GET", url: "https://edith.xiaohongshu.com/api/sns/web/v1/homefeed?num=3" },
    { name: "搜索推荐", method: "GET", url: "https://edith.xiaohongshu.com/api/sns/web/v1/search/recommend?keyword=%E5%8E%9F%E7%A5%9E" },
    { name: "笔记详情 v2", method: "GET", url: "https://edith.xiaohongshu.com/api/sns/web/v2/feed?note_id=6749d64c000000001f028c42" },
  ];

  for (const t of tests) {
    process.stdout.write(`⏳ ${t.name}... `);
    try {
      const result = await crawler.fetch(t.url, session, { method: t.method });
      let code = -1, msg = "", preview = "";
      if (result.headers["content-type"]?.includes("json")) {
        const body = JSON.parse(result.body);
        code = body.code ?? -1;
        msg = body.msg ?? body.message ?? "";
        const d = body.data ?? {};
        if (code === 0) {
          if (d.items) preview = `items: ${d.items.length}`;
          else if (d.notes) preview = `notes: ${d.notes.length}`;
          else if (d.sug_items) preview = `suggestions: ${d.sug_items.length}`;
          else preview = Object.keys(d).slice(0, 5).join(", ");
        } else {
          preview = JSON.stringify(body).slice(0, 200);
        }
      } else {
        preview = result.body.slice(0, 80);
      }
      const status = code === 0 ? "✅" : "❌";
      console.log(`${status} code=${code} msg=${msg} (${result.responseTime}ms)`);
      console.log(`   ${preview}`);
    } catch (e: any) {
      console.log(`❌ 异常: ${e.message}`);
    }
  }
}

main().catch(console.error);
