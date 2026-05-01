import fs from "fs";
import { CrawlerSession } from "../src/core/ports/ISiteCrawler";
import { buildSignedQuery } from "../src/utils/crypto/bilibili-signer";

async function main() {
  const raw = JSON.parse(fs.readFileSync("sessions/bilil.session.json", "utf-8"));
  // @ts-ignore
  const imgKey = "7cd084941338484aae1ad9425b84077";
  // @ts-ignore
  const subKey = "4932caff0ff746eab6f01bf08b70ac4";
  const session: CrawlerSession = { cookies: raw.cookies, localStorage: raw.localStorage };

  const cookieStr = session.cookies.map((c: any) => `${c.name}=${c.value}`).join("; ");

  async function test(name: string, basePath: string, params: Record<string, string>, needWbi: boolean) {
    process.stdout.write(`⏳ ${name}... `);
    try {
      const { default: fetch } = await import("node-fetch");
      let query = "";
      if (needWbi) {
        query = buildSignedQuery(params, imgKey, subKey);
      } else {
        query = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
      }
      const url = `https://api.bilibili.com${basePath}?${query}`;
      const r = await fetch(url, { headers: { Cookie: cookieStr, "User-Agent": "Mozilla/5.0", Referer: "https://www.bilibili.com/" } });
      const body = await r.json();
      const icon = body.code === 0 ? "✅" : "❌";
      console.log(`${icon} code=${body.code} ${body.message || ""}`);
      if (body.code === 0 && body.data) {
        const d = body.data;
        if (d.result) console.log(`   结果: ${d.result.length}`);
        if (d.archives) console.log(`   稿件: ${d.archives.length}`);
        if (d.vlist) console.log(`   vlist: ${d.vlist.length}`);
        if (d.replies) console.log(`   评论: ${d.replies.length}`);
        if (d.page) console.log(`   页码: ${d.page.num}/${d.page.total}`);
        console.log(`   预览: ${JSON.stringify(d).slice(0, 150)}`);
      }
    } catch (e: any) {
      console.log(`❌ ${e.message}`);
    }
  }

  await test("搜索视频", "/x/web-interface/wbi/search/search", { keyword: "原神", search_type: "video", page: "1" }, true);
  await test("搜索综合", "/x/web-interface/wbi/search/all/v2", { keyword: "原神", page: "1" }, true);
  await test("搜索 type", "/x/web-interface/wbi/search/type", { keyword: "原神", search_type: "video", page: "1" }, true);
  await test("UP主投稿", "/x/space/wbi/arc/search", { mid: "173323339", ps: "5", pn: "1" }, true);
  await test("UP主投稿 v1", "/x/space/arc/search", { mid: "173323339", ps: "5", pn: "1" }, false);
  await test("评论 main", "/x/v2/reply/main", { oid: "116487482245275", type: "1", mode: "3", ps: "5" }, false);
  await test("评论 reply", "/x/v2/reply/reply", { oid: "116487482245275", type: "1", pn: "1" }, false);
}

main().catch(console.error);
