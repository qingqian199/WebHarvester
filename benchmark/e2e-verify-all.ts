/**
 * 特化爬虫端到端全流程验证脚本。
 * 测试三个站点的组合采集模式。
 */
import fs from "fs";
import { XhsCrawler } from "../src/adapters/crawlers/XhsCrawler";
import { ZhihuCrawler } from "../src/adapters/crawlers/ZhihuCrawler";
import { BilibiliCrawler } from "../src/adapters/crawlers/BilibiliCrawler";
import { CrawlerSession } from "../src/core/ports/ISiteCrawler";
import { XHS_CONTENT_UNITS, ZHIHU_CONTENT_UNITS, BILI_CONTENT_UNITS } from "../src/core/models/ContentUnit";

function loadSession(path: string): CrawlerSession | null {
  try {
    const raw = JSON.parse(fs.readFileSync(path, "utf-8"));
    return { cookies: raw.cookies ?? [], localStorage: raw.localStorage ?? {} };
  } catch { return null; }
}

function zhihuSessionFromHarvest(): CrawlerSession | null {
  try {
    const raw = JSON.parse(fs.readFileSync("output/zhuanlan_zhihu_com/harvest-mol08u91_nyln72mr.json", "utf-8"));
    const cookies = (raw.storage?.cookies ?? []).map((c: any) => ({ name: c.name, value: c.value, domain: c.domain }));
    return { cookies, localStorage: {} };
  } catch { return null; }
}

async function testCrawler(
  name: string,
  crawler: any,
  units: typeof XHS_CONTENT_UNITS,
  session: CrawlerSession | null,
  params: Record<string, string>,
) {
  const unitIds = units.map((u) => u.id);
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${name} 组合采集验证`);
  console.log(`  Session: ${session ? "✅ " + session.cookies.length + " cookies" : "❌ 无"}`);
  console.log(`  单元数: ${unitIds.length}`);
  console.log(`  参数: ${JSON.stringify(params)}`);
  console.log("=\").repeat(60)}");

  const startAll = Date.now();
  const results = await crawler.collectUnits(unitIds, params, session);
  const totalTime = Date.now() - startAll;

  console.log(`\n  📊 结果汇总 (总耗时: ${totalTime}ms):\n`);

  let success = 0, partial = 0, failed = 0;
  results.forEach((r: any) => {
    const def = units.find((u) => u.id === r.unit);
    const icon = r.status === "success" ? "✅" : r.status === "partial" ? "⚠️" : "❌";
    const methodIcon = r.method === "signature" ? "🔵" : r.method === "html_extract" ? "🟠" : "⚪";
    console.log(`  ${icon} ${def?.label ?? r.unit}`);
    console.log(`     ${methodIcon} ${r.method} | ${r.responseTime}ms`);
    if (r.error) console.log(`     错误: ${r.error}`);
    if (r.status === "success" && r.data) {
      const preview = JSON.stringify(r.data).slice(0, 150);
      console.log(`     数据预览: ${preview}`);
    }
    if (r.status === "success") success++;
    else if (r.status === "partial") partial++;
    else failed++;
  });

  return { success, partial, failed, total: results.length, totalTime };
}

async function main() {
  const xhsSession = loadSession("sessions/xiaohongshu.session.json");
  const biliSession = loadSession("sessions/bilil.session.json");
  const zhihuSession = zhihuSessionFromHarvest();

  // 从小红书 session 获取用户 ID
  let xhsUid = "";
  if (xhsSession) {
    const xhs = new XhsCrawler();
    try {
      const me = await xhs.fetchApi("用户信息", {}, xhsSession);
      const d = JSON.parse(me.body);
      xhsUid = d.data?.user_id ?? "";
    } catch {}
  }

  const results: any[] = [];

  // 1. 小红书
  if (xhsSession) {
    const xhs = new XhsCrawler();
    const r = await testCrawler("小红书", xhs, XHS_CONTENT_UNITS, xhsSession, {
      user_id: xhsUid || "69d845e10000000032025fea",
      note_id: "6749d64c000000001f028c42",
      keyword: "原神",
    });
    results.push({ name: "小红书", ...r });
  }

  // 2. 知乎
  if (zhihuSession) {
    const zhihu = new ZhihuCrawler();
    const r = await testCrawler("知乎", zhihu, ZHIHU_CONTENT_UNITS, zhihuSession, {
      member_id: "liu-jack-79",
      keyword: "TypeScript",
      article_id: "1896686592673949413",
    });
    results.push({ name: "知乎", ...r });
  }

  // 3. B站
  if (biliSession) {
    const bili = new BilibiliCrawler();
    const raw = JSON.parse(fs.readFileSync("sessions/bilil.session.json", "utf-8"));
    const ls = raw.localStorage || {};
    const extractKey = (url: string) => { try { return url.split("/").pop()?.split(".")[0]?.split("-").slice(1).join("-") || ""; } catch { return ""; } };
    const imgKey = ls.wbi_img_url ? extractKey(ls.wbi_img_url) : "7cd084941338484aae1ad9425b84077";
    const subKey = ls.wbi_sub_url ? extractKey(ls.wbi_sub_url) : "4932caff0ff746eab6f01bf08b70ac4";
    bili.setWbiKeys(imgKey, subKey);

    const r = await testCrawler("B站", bili, BILI_CONTENT_UNITS, biliSession, {
      aid: "116435892372604",
      keyword: "TypeScript",
      mid: "316627722",
    });
    results.push({ name: "B站", ...r });
  }

  // 总结报告
  console.log(`\n\n${"=".repeat(60)}`);
  console.log("  全流程验证报告");
  console.log("=".repeat(60));
  console.log("");
  console.log("  站点      | 成功 | 降级 | 失败 | 总计 | 总耗时");
  console.log("  " + "-".repeat(52));
  results.forEach((r) => {
    console.log(`  ${r.name.padEnd(10)}| ${r.success.toString().padStart(4)} | ${r.partial.toString().padStart(4)} | ${r.failed.toString().padStart(4)} | ${r.total.toString().padStart(4)} | ${r.totalTime}ms`);
  });
  console.log("");
}

main().catch(console.error);
