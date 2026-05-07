/**
 * 全量爬取 vs 特化爬虫数据校验脚本。
 *
 * 用法:
 *   npx ts-node scripts/validate-crawler.ts <full-harvest.json> <crawler-result.json>
 *
 * 输入:
 *   - full-harvest.json: 从全量采集 (captureAllNetwork=true) 得到的 harvest-*.json
 *   - crawler-result.json: 从特化爬虫组合采集得到的 combined-*.json
 *
 * 输出:
 *   - 按内容单元生成的字段对比报告，标注缺失值/默认值
 */

import fs from "fs/promises";
import path from "path";

interface ValidationResult {
  unit: string;
  status: "ok" | "missing" | "mismatch";
  fields: Array<{
    name: string;
    fullValue: unknown;
    crawlerValue: unknown;
    match: boolean;
  }>;
}

function isDefaultValue(val: unknown): boolean {
  if (val == null || val === "" || val === 0 || val === "0" || val === "未知标题" || val === "?" || val === "未知时间") return true;
  return false;
}

function formatVal(val: unknown): string {
  if (typeof val === "string") return val.length > 100 ? val.slice(0, 100) + "..." : val;
  if (val && typeof val === "object") return JSON.stringify(val).slice(0, 150);
  return String(val ?? "null");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error("用法: npx ts-node scripts/validate-crawler.ts <full-harvest.json> <crawler-result.json>");
    process.exit(1);
  }

  const fullPath = path.resolve(args[0]);
  const crawlerPath = path.resolve(args[1]);

  const fullRaw = await fs.readFile(fullPath, "utf-8");
  const crawlerRaw = await fs.readFile(crawlerPath, "utf-8");

  const fullData = JSON.parse(fullRaw);
  const crawlerData = JSON.parse(crawlerRaw);

  // 全量采集: fullData.networkRequests 包含所有请求
  // 特化爬虫: crawlerData 是 UnitResult[] 数组
  const crawlerResults = Array.isArray(crawlerData) ? crawlerData : [crawlerData];

  console.log("\n📊 数据校验报告");
  console.log(`   ${"=".repeat(60)}`);
  console.log(`   全量采集: ${path.basename(fullPath)} (${fullData.networkRequests?.length || 0} 个请求)`);
  console.log(`   特化爬虫: ${path.basename(crawlerPath)} (${crawlerResults.length} 个单元)`);
  console.log(`   ${"=".repeat(60)}\n`);

  const results: ValidationResult[] = [];
  let totalIssues = 0;

  for (const result of crawlerResults) {
    const unit = result.unit || "unknown";
    const data = result.data;
    const apiData = data?.data || data;
    const view = apiData?.View || apiData;

    const vr: ValidationResult = { unit, status: "ok", fields: [] };

    // 视频信息
    if (unit === "bili_video_info") {
      const checks: Array<{ name: string; fullPath: string; crawlerGetter: () => unknown }> = [
        { name: "title", fullPath: "data.View.title", crawlerGetter: () => view?.title },
        { name: "播放", fullPath: "data.View.stat.view", crawlerGetter: () => view?.stat?.view },
        { name: "点赞", fullPath: "data.View.stat.like", crawlerGetter: () => view?.stat?.like },
        { name: "UP主", fullPath: "data.View.owner.name", crawlerGetter: () => view?.owner?.name },
        { name: "简介", fullPath: "data.View.desc", crawlerGetter: () => view?.desc },
        { name: "时长", fullPath: "data.View.duration", crawlerGetter: () => view?.duration },
        { name: "分区", fullPath: "data.View.tname", crawlerGetter: () => view?.tname },
      ];

      for (const check of checks) {
        const cv = check.crawlerGetter();
        const match = !isDefaultValue(cv);
        if (!match) totalIssues++;
        vr.fields.push({ name: check.name, fullValue: check.fullPath, crawlerValue: cv, match });
      }

      if (vr.fields.some(f => !f.match)) vr.status = "missing";
    }

    // 视频评论
    if (unit === "bili_video_comments" || unit === "bili_video_sub_replies") {
      if (data?.code === 0 && data?.data?.replies?.length > 0) {
        const sample = data.data.replies[0];
        const hasCtime = sample?.ctime != null && sample.ctime !== "" && sample.ctime !== "未知时间";
        vr.fields.push({ name: "评论数", fullValue: ">0", crawlerValue: data.data.replies.length, match: true });
        vr.fields.push({ name: "ctime", fullValue: "有效日期", crawlerValue: sample?.ctime ?? "null", match: hasCtime });
        vr.fields.push({ name: "member.uname", fullValue: "有效用户名", crawlerValue: sample?.member?.uname ?? "null", match: !!sample?.member?.uname });
        if (!hasCtime) { vr.status = "mismatch"; totalIssues++; }
      } else {
        vr.fields.push({ name: "replies", fullValue: "非空", crawlerValue: "空/0", match: false });
        vr.status = "missing";
        totalIssues++;
      }
    }

    results.push(vr);
  }

  // 输出报告
  for (const vr of results) {
    const icon = vr.status === "ok" ? "✅" : vr.status === "missing" ? "❌" : "⚠️";
    console.log(`${icon} ${vr.unit}`);
    for (const f of vr.fields) {
      const fi = f.match ? "✅" : "❌";
      const annotation = f.match ? "" : `  ← 全量路径: ${f.fullValue}`;
      console.log(`     ${fi} ${f.name}: ${formatVal(f.crawlerValue)}${annotation}`);
    }
    console.log("");
  }

  console.log(`📋 汇总: ${results.length} 个单元, ${totalIssues} 个问题`);
  if (totalIssues > 0) {
    console.log("💡 提示: 检查上述 ❌ 标记的字段。若是特化爬虫返回默认值(0/空/未知标题),说明 API 响应数据映射路径不匹配。");
  }
  process.exit(totalIssues > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("❌ 运行失败:", (e as Error).message);
  process.exit(1);
});
