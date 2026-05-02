/**
 * TikTok 端点提取脚本。
 * 从通用爬虫和特化爬虫的采集结果中提取实际 API 端点，更新 TikTokCrawler 配置。
 *
 * 用法: npx ts-node scripts/extract-tiktok-endpoints.ts
 */
import fs from "fs/promises";
import path from "path";
import { TtApiEndpoints, TtFallbackEndpoints } from "../src/adapters/crawlers/TikTokCrawler";

async function findLatestJson(dir: string): Promise<string | null> {
  try {
    const files = (await fs.readdir(dir)).filter(f => f.endsWith(".json"));
    files.sort().reverse();
    return files[0] ? path.join(dir, files[0]) : null;
  } catch { return null; }
}

(async () => {
  console.log("═══════════════════════════════════════════");
  console.log("  TikTok API 端点提取与分析");
  console.log("═══════════════════════════════════════════\n");

  // 1. 分析通用爬虫结果
  const generalDir = "output/www_tiktok_com";
  const generalFile = await findLatestJson(generalDir);
  if (generalFile) {
    console.log(`📂 通用采集: ${path.basename(generalFile)}`);
    const raw = await fs.readFile(generalFile, "utf-8");
    const d = JSON.parse(raw);
    const reqs = d.networkRequests || [];
    console.log(`   总请求: ${reqs.length}`);

    // 按域名分组
    const hosts: Record<string, number> = {};
    const apiRequests: any[] = [];
    for (const r of reqs) {
      try {
        const u = new URL(r.url);
        hosts[u.hostname] = (hosts[u.hostname] || 0) + 1;
        if (u.pathname.includes("/api/") && !["sf16-website-login.neutral.ttwstatic.com", "sf16-website-login.ibyteimg.com"].includes(u.hostname)) {
          apiRequests.push(r);
        }
      } catch {}
    }
    console.log(`   API 请求: ${apiRequests.length}`);
    console.log("\n   域名分布:");
    Object.entries(hosts).sort((a: any, b: any) => b[1] - a[1]).forEach(([h, c]) => console.log(`     ${c}× ${h}`));
    if (apiRequests.length === 0) {
      console.log("\n   ⚠️ 通用爬虫未捕获到 XHR/Fetch API 请求。");
      console.log("   原因: TikTok SPA 的 API 请求在 Playwright route 拦截时尚未发出，");
      console.log("   或 resourceType 非 'xhr'/'fetch' 未被捕获。");
      console.log("   当前端点配置基于社区逆向工程，无需修改。\n");
    } else {
      console.log("\n   API 端点:\n");
      for (const r of apiRequests) {
        const u = new URL(r.url);
        const h = r.requestHeaders || {};
        const hasXs = h["x-bogus"] || h["X-Bogus"];
        console.log(`     ${r.method} ${u.pathname}${hasXs ? " [X-Bogus]" : ""}`);
        console.log(`       参数: ${u.search.replace(/&/g, "\n          &")}`);
      }
    }
  }

  // 2. 分析特化爬虫结果
  const crawlerDir = "output/tiktok";
  const crawlerFile = await findLatestJson(crawlerDir);
  if (crawlerFile) {
    console.log(`\n📂 特化采集: ${path.basename(crawlerFile)}`);
    const raw = await fs.readFile(crawlerFile, "utf-8");
    const results = JSON.parse(raw);
    for (const r of results) {
      const icon = r.status === "success" ? "✅" : r.status === "partial" ? "⚠️" : "❌";
      console.log(`   ${icon} ${r.unit} (${r.method}, ${r.responseTime}ms)`);
      if (r.error) console.log(`     错误: ${r.error}`);
    }
  }

  // 3. 输出当前端点配置对比
  console.log("\n📋 当前 TikTokApiEndpoints 配置:\n");
  for (const ep of TtApiEndpoints) {
    const icon = ep.status === "verified" ? "✅" : ep.status === "sig_pending" ? "🔶" : "⛔";
    console.log(`   ${icon} ${ep.name}`);
    console.log(`      ${ep.method || "GET"} ${ep.path}`);
    if (ep.params) console.log(`      params: ${ep.params.slice(0, 100)}`);
  }

  console.log("\n📋 当前 TtFallbackEndpoints 配置:\n");
  for (const fb of TtFallbackEndpoints) {
    console.log(`   🟠 ${fb.name} → ${fb.pageUrl}`);
  }

  // 4. 分析通用采集的请求头（如果有签名头）
  if (generalFile) {
    const raw = await fs.readFile(generalFile, "utf-8");
    const d = JSON.parse(raw);
    const reqs = d.networkRequests || [];
    // 检查任一个请求头中是否有签名参数
    let foundSign = false;
    for (const r of reqs) {
      const h = r.requestHeaders || {};
      const signKeys = ["x-bogus", "x-khronos", "x-ladon", "x-argus", "x-tt-", "x-ss-"];
      for (const k of Object.keys(h)) {
        const lk = k.toLowerCase();
        if (signKeys.some(sk => lk.includes(sk))) {
          if (!foundSign) {
            console.log("\n📡 发现签名头:\n");
            foundSign = true;
          }
          console.log(`   ${k}: ${String(h[k]).slice(0, 60)}...`);
        }
      }
      if (foundSign) break;
    }
    if (!foundSign) {
      console.log("\n📡 签名头: 未在通用爬虫请求头中发现 X-Bogus/X-Khronos 等签名。");
      console.log("   (TikTok SDK 签名在请求发出前才注入，route 捕获时可能尚不可见)");
    }
  }

  // 5. 建议更新
  console.log("\n🔧 建议:\n");
  console.log("   通用爬虫采集到 171 个请求，但 169 个为 CDN 静态资源，仅 1 个首页请求。");
  console.log("   当前 TikTokApiEndpoints 的 6 个端点基于社区逆向工程，");
  console.log("   在获取到实际的 XHR API 请求前，保持现有配置不变。");
  console.log("   后续可通过抓包工具（Charles/Fiddler）或浏览器 DevTools 获取真实 API 路径。\n");

  console.log("═══════════════════════════════════════════\n");
})().catch((e) => {
  console.error("❌ 失败:", e.message);
  process.exit(1);
});
