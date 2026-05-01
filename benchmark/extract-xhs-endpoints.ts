import fs from "fs";
import { DataClassifier } from "../src/core/services/DataClassifier";

function main() {
  const raw = fs.readFileSync("output/www_xiaohongshu_com/harvest-molmbzii_891k4p32.json", "utf-8");
  const result = JSON.parse(raw);

  const classifier = new DataClassifier();
  const classified = classifier.classify(result);

  console.log("=== 从采集结果提取的核心 API 端点 ===\n");
  classified.core.apiEndpoints.forEach((ep, i) => {
    console.log(`[${i + 1}] ${ep.method} ${ep.url}`);
    console.log(`    状态: ${ep.statusCode}`);
    const url = new URL(ep.url);
    console.log(`    路径: ${url.pathname}`);
    if (url.search) {
      console.log("    参数:");
      url.searchParams.forEach((v, k) => console.log(`      ${k}: ${v}`));
    }
    console.log("");
  });

  console.log("=== 鉴权令牌 ===\n");
  Object.entries(classified.core.authTokens).forEach(([k, v]) => {
    console.log(`  ${k}: ${v.slice(0, 40)}...`);
  });

  console.log("\n=== 反爬检测 ===\n");
  classified.core.antiCrawlDefenses.forEach((d) => {
    console.log(`  ${d.category} (${d.severity})`);
  });

  // 生成可直接用于 XhsApiEndpoints 的端点配置
  console.log("\n=== 可用于 XhsApiEndpoints 的端点配置 ===\n");
  const seen = new Set<string>();
  classified.core.apiEndpoints.forEach((ep) => {
    const url = new URL(ep.url);
    const key = `${ep.method} ${url.pathname}`;
    if (seen.has(key)) return;
    seen.add(key);

    const params: string[] = [];
    url.searchParams.forEach((v, k) => params.push(`${k}=${v}`));

    console.log(`{ name: "${ep.method} ${url.pathname.split("/").pop()}",`);
    console.log(`  path: "${url.pathname}",`);
    console.log(`  method: "${ep.method}",`);
    if (params.length) console.log(`  params: "${params.join("&")}",`);
    console.log("},");
  });
}

main();
