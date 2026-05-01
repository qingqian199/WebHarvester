import fs from "fs";
import { BilibiliCrawler } from "../src/adapters/crawlers/BilibiliCrawler";
import { CrawlerSession } from "../src/core/ports/ISiteCrawler";

async function main() {
  const raw = JSON.parse(fs.readFileSync("sessions/bilil.session.json", "utf-8"));
  const session: CrawlerSession = { cookies: raw.cookies, localStorage: raw.localStorage };
  const c = new BilibiliCrawler();

  // 从 localStorage 获取 WBI 密钥
  const ls = raw.localStorage || {};
  const imgUrl = ls.wbi_img_url || ls.wbi_img_urls || "";
  const subUrl = ls.wbi_sub_url || "";
  const extractKey = (url: string) => { try { return url.split("/").pop()?.split(".")[0]?.split("-").slice(1).join("-") || ""; } catch { return ""; } };
  const imgKey = imgUrl ? extractKey(imgUrl) : "7cd084941338484aae1ad9425b84077";
  const subKey = subUrl ? extractKey(subUrl) : "4932caff0ff746eab6f01bf08b70ac4";
  c.setWbiKeys(imgKey, subKey);
  console.log("WBI keys loaded from session");
  console.log("img_key:", imgKey.slice(0, 20) + "...");
  console.log("sub_key:", subKey.slice(0, 20) + "...\n");

  // 测试端点
  const tests: Array<{ name: string; params?: Record<string, string> }> = [
    { name: "视频信息", params: { aid: "116435892372604" } },
    { name: "用户信息", params: { mid: "316627722" } },
    { name: "直播间信息", params: { uids: "316627722" } },
  ];

  for (const t of tests) {
    process.stdout.write(`⏳ ${t.name}... `);
    try {
      const r = await c.fetchApi(t.name, t.params, session);
      if (r.headers["content-type"]?.includes("json")) {
        const body = JSON.parse(r.body);
        const code = body.code;
        const icon = code === 0 ? "✅" : "❌";
        console.log(`${icon} code=${code} (${r.responseTime}ms)`);
        if (code === 0 && body.data) {
          const dataStr = JSON.stringify(body.data).slice(0, 200);
          console.log(`   ${dataStr}`);
        } else if (code !== 0) {
          console.log(`   ${JSON.stringify(body).slice(0, 200)}`);
        }
      } else {
        console.log(`❌ HTTP=${r.statusCode} ${r.body.slice(0, 80)}`);
      }
    } catch (e: any) {
      console.log(`❌ 异常: ${e.message}`);
    }
  }
}

main().catch(console.error);
