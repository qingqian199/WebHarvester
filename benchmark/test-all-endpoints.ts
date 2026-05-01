import fs from "fs";
import { XhsCrawler, XhsApiEndpoints } from "../src/adapters/crawlers/XhsCrawler";
import { CrawlerSession } from "../src/core/ports/ISiteCrawler";

async function main() {
  const raw = fs.readFileSync("sessions/xiaohongshu.session.json", "utf-8");
  const d = JSON.parse(raw);
  const session: CrawlerSession = { cookies: d.cookies, localStorage: d.localStorage };
  const c = new XhsCrawler();

  // 从 /v2/user/me 获取有效 user_id
  const meRes = await c.fetchApi("用户信息", "", session);
  const meData = JSON.parse(meRes.body);
  const myUid = meData.data?.user_id ?? "";
  console.log(`用户 ID: ${myUid}\n`);

  for (const ep of XhsApiEndpoints) {
    let params = ep.defaultParams;
    if (params.includes("user_id=")) {
      params = params.replace("user_id=", `user_id=${myUid}`);
    }
    const r = await c.fetchApi(ep.name, params, session);
    const body = JSON.parse(r.body);
    const status = body.code === 0 ? "✅" : body.code === 1000 ? "✅" : "❌";
    console.log(`${status} ${ep.name}`);
    console.log(`   ${ep.path}?${params || "(无参数)"}`);
    console.log(`   code=${body.code} ${body.msg??""} (${r.responseTime}ms)`);
    if (body.code === 0 && body.data) {
      const keys = Object.keys(body.data);
      console.log(`   data keys: ${keys.slice(0,6).join(", ")}`);
      if (body.data.items) console.log(`   items: ${body.data.items.length}`);
      if (body.data.boards) console.log(`   boards: ${body.data.boards.length}`);
    }
    console.log("");
  }
}

main().catch(console.error);
