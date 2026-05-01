import fs from "fs";
import { XhsCrawler } from "../src/adapters/crawlers/XhsCrawler";
import { CrawlerSession } from "../src/core/ports/ISiteCrawler";

async function main() {
  const sessionRaw = fs.readFileSync("sessions/xiaohongshu.session.json", "utf-8");
  const d = JSON.parse(sessionRaw);
  const session: CrawlerSession = { cookies: d.cookies, localStorage: d.localStorage };
  const c = new XhsCrawler();

  // 从采集结果中确认的参数直接测试
  const uid = "69d845e10000000032025fea";
  const tests = [
    // board/user - 参数从采集结果确认：user_id, num, page
    { n: "board/user（数字 id）", u: `https://edith.xiaohongshu.com/api/sns/web/v1/board/user?user_id=${uid}&num=5&page=1` },
    { n: "board/user（空 id，从采集结果复制）", u: "https://edith.xiaohongshu.com/api/sns/web/v1/board/user?user_id=&num=5&page=1" },
    // user_posted - 用采集结果确认的参数名
    { n: "user_posted", u: `https://edith.xiaohongshu.com/api/sns/web/v1/user_posted?user_id=${uid}&num=5&page=1` },
    { n: "user_posted（cursor）", u: `https://edith.xiaohongshu.com/api/sns/web/v1/user_posted?user_id=${uid}&num=5&cursor=` },
    // user/otherinfo
    { n: "otherinfo（target_user_id）", u: `https://edith.xiaohongshu.com/api/sns/web/v1/user/otherinfo?target_user_id=${uid}` },
    { n: "otherinfo（user_id）", u: `https://edith.xiaohongshu.com/api/sns/web/v1/user/otherinfo?user_id=${uid}` },
  ];

  for (const t of tests) {
    process.stdout.write(`${t.n}... `);
    const r = await c.fetch(t.u, session);
    if (r.headers["content-type"]?.includes("json")) {
      const body = JSON.parse(r.body);
      const icon = body.code === 0 ? "✅" : "❌";
      console.log(`${icon} code=${body.code} ${body.msg??""} (${r.responseTime}ms)`);
      if (body.code === 0 && body.data) {
        const keys = Object.keys(body.data);
        console.log(`  data keys: ${keys.slice(0,6).join(", ")}`);
        if (body.data.items) console.log(`  items: ${body.data.items.length}`);
        if (body.data.boards) console.log(`  boards: ${body.data.boards.length}`);
        if (body.data.user) console.log(`  user: ${body.data.user.nickname||body.data.user.nick_name||body.data.user.user_id}`);
      }
    } else {
      console.log(`❌ 非JSON (${r.statusCode}) ${r.body.slice(0,80)}`);
    }
  }
}

main().catch(console.error);
