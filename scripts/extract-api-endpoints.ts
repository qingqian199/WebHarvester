/**
 * 从采集结果中提取 API 端点配置，生成 XhsApiEndpoints 更新建议。
 *
 * 用法: npm run extract-endpoints <harvest-*.json>
 * 示例: npm run extract-endpoints output/www_xiaohongshu_com/harvest-mom9ktpt_0hg96tky.json
 */
import fs from "fs";
import path from "path";
import { DataClassifier } from "../src/core/services/DataClassifier";

function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("用法: npm run extract-endpoints <harvest-*.json>");
    console.error("       npx ts-node scripts/extract-api-endpoints.ts <harvest-*.json>");
    process.exit(1);
  }

  const raw = fs.readFileSync(path.resolve(filePath), "utf-8");
  const result = JSON.parse(raw);
  const url = result.targetUrl || result.url || "未知";
  const domain = extractDomain(url);

  console.log("\n═══════════════════════════════════════════");
  console.log(`  采集来源: ${url}`);
  console.log(`  识别域名: ${domain}`);
  console.log(`  请求总数: ${result.networkRequests?.length ?? 0}`);
  console.log("═══════════════════════════════════════════\n");

  // 用 DataClassifier 分类提取核心 API
  const classifier = new DataClassifier();
  const antiCrawl = result.antiCrawlItems || [];
  const classified = classifier.classify(result, antiCrawl);
  const endpoints = classified.core.apiEndpoints;

  if (endpoints.length === 0) {
    console.log("⚠️  未检测到业务 API 端点（被全部过滤或采集结果为纯静态页面）\n");
    return;
  }

  console.log(`检测到 ${endpoints.length} 个业务 API 端点:\n`);

  // 按路径分组，去重
  const seen = new Map<string, typeof endpoints[0]>();
  for (const ep of endpoints) {
    const epUrl = new URL(ep.url);
    const key = `${ep.method} ${epUrl.pathname}`;
    if (!seen.has(key)) seen.set(key, ep);
  }

  // 输出端点表
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  可复制到 XhsApiEndpoints 的配置:\n");

  for (const [, ep] of seen) {
    const epUrl = new URL(ep.url);
    const pathname = epUrl.pathname;
    const method = ep.method;

    // 提取查询参数
    const queryParams: string[] = [];
    epUrl.searchParams.forEach((v, k) => queryParams.push(`${k}=${v}`));

    // 提取请求体参数（如果有）
    let bodyKeys: string[] = [];
    if (ep.requestBody && typeof ep.requestBody === "object") {
      bodyKeys = Object.keys(ep.requestBody as Record<string, unknown>);
    } else if (typeof ep.requestBody === "string" && ep.requestBody.length > 2) {
      try {
        const parsed = JSON.parse(ep.requestBody);
        bodyKeys = Object.keys(parsed);
      } catch { /* not JSON */ }
    }

    console.log(`// ${method} ${pathname}`);
    console.log(`//   状态: ${ep.statusCode} | 来源URL: ${ep.url.slice(0, 100)}`);
    if (queryParams.length > 0) {
      console.log(`//   查询参数: ${queryParams.join(", ")}`);
    }
    if (bodyKeys.length > 0) {
      console.log(`//   Body 字段: ${bodyKeys.join(", ")}`);
    }
    console.log(`{ name: "${extractLastName(pathname)}", path: "${pathname}"${method !== "GET" ? `, method: "${method}"` : ""} },`);
    console.log("");
  }

  // 输出完整端点表
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  端点汇总表:\n");
  console.log("  | 方法 | 路径 | 状态 | 参数 | Body字段 |");
  console.log("  |------|------|:----:|------|----------|");
  for (const [, ep] of seen) {
    const epUrl = new URL(ep.url);
    const queryStr = epUrl.search || "-";
    let bodyInfo = "-";
    if (ep.requestBody && typeof ep.requestBody === "object") {
      bodyInfo = Object.keys(ep.requestBody as Record<string, unknown>).slice(0, 5).join(", ");
      if (Object.keys(ep.requestBody as Record<string, unknown>).length > 5) bodyInfo += "...";
    }
    console.log(`  | ${ep.method} | ${epUrl.pathname} | ${ep.statusCode} | ${queryStr.slice(0, 60)} | ${bodyInfo} |`);
  }

  // 输出用于调试的反爬信息
  if (classified.core.antiCrawlDefenses.length > 0) {
    console.log("\n  反爬检测:\n");
    classified.core.antiCrawlDefenses.forEach((d) => {
      console.log(`  - ${d.category} (${d.severity})`);
    });
  }
  console.log("");
}

function extractDomain(url: string): string {
  try {
    const host = new URL(url).hostname;
    return host.replace("www.", "");
  } catch {
    return "unknown";
  }
}

function extractLastName(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  return parts[parts.length - 1] || pathname;
}

main();
