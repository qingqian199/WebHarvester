/**
 * BilibiliCrawler 采集合一脚本
 * 运行: npx ts-node scripts/bili-crawl.ts
 * 说明: 从 config.json 读取 enableChromeService 配置，自动尝试 ChromeService 降级
 */

import { BilibiliCrawler } from "../src/adapters/crawlers/BilibiliCrawler";
import { ConsoleLogger } from "../src/adapters/ConsoleLogger";
import { FeatureFlags, applyFeatureFlags } from "../src/core/features";
import { loadAppConfig } from "../src/utils/config-loader";
import { clearAllCooldowns } from "../src/utils/rate-limiter";
import { BaseCrawler } from "../src/adapters/crawlers/BaseCrawler";

const TARGET_URL = "https://www.bilibili.com/video/BV1329jBeEqs/";

async function main() {
  const appCfg = await loadAppConfig();
  if (appCfg.features) applyFeatureFlags(appCfg.features);

  // 若启用了 ChromeService，获取端口
  if (FeatureFlags.enableChromeService && appCfg.chromeService) {
    BaseCrawler.chromeServicePort = appCfg.chromeService.port || 9222;
    BaseCrawler.chromeServiceReady = true;
    console.log(`\n🔗 ChromeService 已启用 (端口 ${BaseCrawler.chromeServicePort})`);
  } else {
    console.log("\n⬜ ChromeService 未启用，将使用自启动浏览器");
  }

  console.log(`\n🎯 目标: ${TARGET_URL}\n`);

  clearAllCooldowns();
  const crawler = new BilibiliCrawler();
  const _logger = new ConsoleLogger("debug");

  const bvid = "BV1329jBeEqs";
  console.log(`📌 BV号: ${bvid}\n`);

  // 1. 采集视频信息
  console.log("═══════════════════════════════════════");
  console.log("📦 正在采集视频信息...");
  console.log("═══════════════════════════════════════\n");

  const results = await crawler.collectUnits(["bili_video_info", "bili_video_comments"], {
    url: TARGET_URL,
    bvid,
    max_pages: "1",
  });

  // 2. 输出结果
  for (const r of results) {
    const icon = r.status === "success" ? "✅" : r.status === "partial" ? "⚠️" : "❌";
    console.log(`${icon} [${r.unit}] 状态=${r.status} 方式=${r.method} 耗时=${r.responseTime}ms`);
    if (r.error) console.log(`  错误: ${r.error}`);

    if (r.status === "success" && r.data) {
      const d = r.data as any;
      if (r.unit === "bili_video_info") {
        const info = d.data || {};
        console.log(`  标题: ${info.title}`);
        console.log(`  UP主: ${info.owner?.name} (mid: ${info.owner?.mid})`);
        console.log(`  播放: ${info.stat?.view}  点赞: ${info.stat?.like}  硬币: ${info.stat?.coin}  收藏: ${info.stat?.favorite}  转发: ${info.stat?.share}`);
        console.log(`  时长: ${info.duration}s  发布时间: ${new Date((info.pubdate || 0) * 1000).toLocaleString()}`);
        console.log(`  简介: ${(info.desc || "").slice(0, 100)}`);
        if (d._degraded) console.log(`  ⚠️ 数据来源: 浏览器降级提取 (${d._degradedFrom || "verify"})`);
      }
      if (r.unit === "bili_video_comments") {
        const replies = d.data?.replies || [];
        console.log(`  评论数: ${replies.length}`);
        replies.slice(0, 5).forEach((c: any, i: number) => {
          console.log(`  #${i + 1} ${c.member?.uname}: "${(c.content?.message || "").slice(0, 60)}" 👍${c.like}`);
        });
      }
    }
    console.log("");
  }

  console.log("✅ 采集完成\n");
}

main().catch((e) => {
  console.error("❌ 采集失败:", e.message);
  process.exit(1);
});
