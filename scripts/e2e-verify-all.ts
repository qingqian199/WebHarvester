/**
 * 三站特化爬虫 E2E 验证脚本。
 * 使用真实 URL 执行组合采集，验证所有内容单元的可用性和数据质量。
 *
 * 用法: npx ts-node scripts/e2e-verify-all.ts
 */
import { XhsCrawler } from "../src/adapters/crawlers/XhsCrawler";
import { ZhihuCrawler } from "../src/adapters/crawlers/ZhihuCrawler";
import { BilibiliCrawler } from "../src/adapters/crawlers/BilibiliCrawler";
import { XHS_CONTENT_UNITS, ZHIHU_CONTENT_UNITS, BILI_CONTENT_UNITS } from "../src/core/models/ContentUnit";

interface ReportEntry {
  site: string;
  url: string;
  unit: string;
  status: string;
  method: string;
  time: number;
  dataQuality: Record<string, boolean | number>;
  error?: string;
}

(async () => {
  const report: ReportEntry[] = [];

  const testCases = [
    {
      site: "xiaohongshu",
      url: "https://www.xiaohongshu.com/user/profile/5eb67f19000000000100787f",
      sessionFile: "sessions/xiaohongshu.session.json",
      units: XHS_CONTENT_UNITS.map((u) => u.id),
      createCrawler: () => new XhsCrawler(),
    },
    {
      site: "zhihu",
      url: "https://zhuanlan.zhihu.com/p/1896686592673949413",
      sessionFile: "sessions/zhihu.session.json",
      units: ZHIHU_CONTENT_UNITS.map((u) => u.id),
      createCrawler: () => new ZhihuCrawler(),
    },
    {
      site: "bilibili",
      url: "https://www.bilibili.com/video/BV1BtoYBaELd/",
      sessionFile: "sessions/bilil.session.json",
      units: BILI_CONTENT_UNITS.map((u) => u.id),
      createCrawler: () => new BilibiliCrawler(),
    },
  ];

  for (const tc of testCases) {
    console.log(`\n${"═".repeat(60)}`);
    console.log(`  ${tc.site}`);
    console.log(`  URL: ${tc.url}`);
    console.log(`  Units: ${tc.units.join(", ")}`);
    console.log(`${"═".repeat(60)}\n`);

    // 加载 session
    let session: any = undefined;
    try {
      const raw = await fs.readFile(tc.sessionFile, "utf-8");
      const s = JSON.parse(raw);
      session = { cookies: s.cookies, localStorage: s.localStorage || {} };
      console.log(`  📂 会话已加载: ${tc.sessionFile}\n`);
    } catch {
      console.log(`  ⚠️ 未找到会话文件: ${tc.sessionFile}\n`);
    }

    const crawler = tc.createCrawler();

    // 对 B站：设置 WBI 密钥
    if (tc.site === "bilibili" && session?.localStorage) {
      const ls = session.localStorage;
      const wbiImg = ls.wbi_img_url;
      const wbiSub = ls.wbi_sub_url;
      if (wbiImg && wbiSub) {
        const extractKey = (url: string) => { try { return url.split("/").pop()?.split(".")[0] || url.split("/").pop() || ""; } catch { return ""; } };
        (crawler as any).setWbiKeys(extractKey(wbiImg), extractKey(wbiSub));
      }
    }

    const params: Record<string, string> = { url: tc.url };

    // 执行组合采集
    const start = Date.now();
    const results = await (crawler as any).collectUnits(tc.units, params, session);
    const totalTime = Date.now() - start;

    for (const r of results) {
      const entry: ReportEntry = {
        site: tc.site,
        url: tc.url,
        unit: r.unit,
        status: r.status,
        method: r.method || "none",
        time: r.responseTime || 0,
        dataQuality: {},
        error: r.error,
      };

      // 数据质量检查
      if (r.status !== "failed" && r.data) {
        const d = r.data;
        if (tc.site === "xiaohongshu") {
          if (r.unit === "user_info") {
            entry.dataQuality.hasNickname = !!d?.nickname || !!d?.nick_name || !!d?.data?.nickname;
            entry.dataQuality.hasFollower = (d?.follower_count || d?.data?.follower_count || 0) > 0;
          }
          if (r.unit === "note_detail") {
            entry.dataQuality.hasTitle = !!(d?.title || d?.data?.title);
          }
          if (r.unit === "note_comments") {
            const comments = d?.data?.comments || d?.comments || [];
            entry.dataQuality.commentCount = Array.isArray(comments) ? comments.length : 0;
            entry.dataQuality.hasContent = Array.isArray(comments) ? comments.some((c: any) => c.content) : false;
          }
        }
        if (tc.site === "zhihu") {
          if (r.unit === "zhihu_user_info") {
            entry.dataQuality.hasName = !!d?.name || !!d?.data?.name;
          }
          if (r.unit === "zhihu_article") {
            entry.dataQuality.hasTitle = !!(d?.title || d?.data?.title);
            entry.dataQuality.hasContent = !!(d?.content || d?.body || d?.data?.content);
          }
          if (r.unit === "zhihu_comments") {
            const comments = d?.data || [];
            entry.dataQuality.commentCount = Array.isArray(comments) ? comments.length : 0;
          }
        }
        if (tc.site === "bilibili") {
          if (r.unit === "bili_video_info") {
            entry.dataQuality.hasTitle = !!d?.data?.title;
            entry.dataQuality.hasViewCount = (d?.data?.stat?.view || 0) > 0;
          }
          if (r.unit === "bili_video_comments") {
            const replies = d?.data?.replies || [];
            entry.dataQuality.commentCount = Array.isArray(replies) ? replies.length : 0;
            entry.dataQuality.hasReplyContent = Array.isArray(replies) ? replies.some((c: any) => c.content?.message) : false;
          }
          if (r.unit === "bili_video_sub_replies") {
            entry.dataQuality.expandedCount = d?.data?.expanded_count || d?.expanded_count || 0;
            entry.dataQuality.totalReplies = d?.data?.total_replies || d?.total_replies || 0;
          }
        }
      }

      const icon = entry.status === "success" ? "✅" : entry.status === "partial" ? "⚠️" : "❌";
      const methodIcon = entry.method === "signature" ? "🔵" : entry.method === "html_extract" ? "🟠" : "⚪";
      const details = Object.entries(entry.dataQuality)
        .filter(([, v]) => typeof v === "boolean")
        .map(([k, v]) => `${v ? "✅" : "❌"}${k}`)
        .join(" ");
      console.log(`  ${icon} ${r.unit.padEnd(25)} ${methodIcon} ${String(entry.time).padEnd(6)}ms ${details}`);
      if (entry.error) console.log(`     ⚠️ ${entry.error}`);

      report.push(entry);
    }
    console.log(`\n  ⏱ 总耗时: ${totalTime}ms`);
  }

  // ─── 输出报告 ───
  const sigCount = report.filter((r) => r.method === "signature" && r.status === "success").length;
  const htmlCount = report.filter((r) => r.method === "html_extract" && r.status !== "failed").length;
  const successCount = report.filter((r) => r.status === "success").length;
  const partialCount = report.filter((r) => r.status === "partial").length;
  const failCount = report.filter((r) => r.status === "failed").length;

  console.log(`\n${"═".repeat(60)}`);
  console.log("  验证报告");
  console.log(`${"═".repeat(60)}\n`);
  console.log(`  总单元数: ${report.length}`);
  console.log(`  ✅ 成功: ${successCount} (${((successCount / report.length) * 100).toFixed(0)}%)`);
  console.log(`  ⚠️ 部分: ${partialCount}`);
  console.log(`  ❌ 失败: ${failCount}`);
  console.log(`  🔵 签名直连: ${sigCount}`);
  console.log(`  🟠 页面提取: ${htmlCount}`);

  const summary = {
    testedAt: new Date().toISOString(),
    total: report.length,
    success: successCount,
    partial: partialCount,
    failed: failCount,
    signatureDirect: sigCount,
    htmlExtract: htmlCount,
    details: report,
  };

  await fs.writeFile("output/e2e-report.json", JSON.stringify(summary, null, 2), "utf-8");
  console.log("\n📁 报告已保存: output/e2e-report.json\n");
})().catch((e) => {
  console.error("❌ 失败:", e.message);
});
