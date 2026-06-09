import fs from "fs";
import { ZhihuCrawler } from "../src/adapters/crawlers/ZhihuCrawler";
import { CrawlerSession } from "../src/core/ports/ISiteCrawler";

async function main() {
  // 从 harvest 结果中提取知乎 Cookie
  const raw = JSON.parse(fs.readFileSync("output/zhuanlan_zhihu_com/harvest-mol08u91_nyln72mr.json", "utf-8"));
  const harvestCookies = raw.storage.cookies || [];
  const cookies = harvestCookies.map((c: any) => ({ name: c.name, value: c.value, domain: c.domain }));
  const session: CrawlerSession = { cookies, localStorage: {} };
  console.log(`加载 ${cookies.length} 个 Cookie\n`);

  const c = new ZhihuCrawler();

  // 测试已知端点
  const tests: Array<{ name: string; params?: Record<string, string> }> = [
    { name: "当前用户" },
    { name: "文章详情", params: { article_id: "1896686592673949413" } },
    { name: "成员信息", params: { member_id: "liu-jack-79" } },
    { name: "热门搜索" },
  ];

  for (const t of tests) {
    process.stdout.write(`⏳ ${t.name}... `);
    try {
      const r = await c.fetchApi(t.name, t.params, session);
      let code = -1;
      if (r.headers["content-type"]?.includes("json")) {
        const body = JSON.parse(r.body);
        code = body.code ?? r.statusCode;
        const data = body.data ?? {};
        const preview = code === 0
          ? JSON.stringify(data).slice(0, 150)
          : body.error?.message || body.msg || "";
        const icon = r.statusCode === 200 ? "✅" : "❌";
        console.log(`${icon} HTTP=${r.statusCode} code=${code} (${r.responseTime}ms)`);
        console.log(`   ${preview.slice(0, 200)}`);
      } else if (r.statusCode === 200) {
        console.log(`✅ HTTP=200 (非JSON) 前80字: ${r.body.slice(0, 80)}`);
      } else {
        console.log(`❌ HTTP=${r.statusCode} ${r.body.slice(0, 80)}`);
      }
    } catch (e: any) {
      console.log(`❌ 异常: ${e.message}`);
    }
  }
}

main().catch(console.error);
