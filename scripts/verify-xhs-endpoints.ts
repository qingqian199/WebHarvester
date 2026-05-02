/**
 * 小红书端点验证脚本。
 * 加载已存 session，对每个端点调用 fetchApi 并记录结果。
 *
 * 用法: npx ts-node scripts/verify-xhs-endpoints.ts
 */
import fs from "fs/promises";
import path from "path";
import { XhsCrawler, XhsApiEndpoints } from "../src/adapters/crawlers/XhsCrawler";

interface CachedSession {
  cookies: Array<{ name: string; value: string; domain?: string }>;
  localStorage?: Record<string, string>;
}

function fmt(label: string, val: string): string {
  return `${label.padEnd(18)} ${val}`;
}

(async () => {
  console.log("\n═══════════════════════════════════════════");
  console.log("  小红书端点验证");
  console.log("═══════════════════════════════════════════\n");

  // 加载 session
  const sessionPath = path.resolve("sessions/xiaohongshu.session.json");
  let session: CachedSession | undefined;
  try {
    const raw = await fs.readFile(sessionPath, "utf-8");
    session = JSON.parse(raw);
    const cookieCount = session?.cookies?.length ?? 0;
    const a1 = session?.cookies?.find((c) => c.name === "a1");
    console.log(`📂 已加载会话: ${path.basename(sessionPath)}`);
    console.log(`   Cookie 数量: ${cookieCount}`);
    console.log(`   a1 cookie: ${a1 ? "✅" : "❌ 缺失 (X-s 签名将失败)"}`);
    console.log();
  } catch {
    console.warn("⚠️ 未找到 xiaohongshu.session.json，将以游客态运行");
  }

  const crawler = new XhsCrawler();
  const crawlerSession = session
    ? { cookies: session.cookies, localStorage: session.localStorage }
    : undefined;

  // 待验证的端点
  const testCases: Array<{
    name: string;
    params: Record<string, string>;
    authMode?: "logged_in" | "guest";
  }> = [
    // 已验证的基线
    { name: "用户信息", params: {} },
    { name: "搜索建议", params: {} },
    // 🔶 待验证
    { name: "搜索一站式", params: { keyword: "原神" } },
    { name: "搜索筛选", params: { keyword: "原神" } },
    { name: "收藏列表", params: {} },
    // ⛔ 搜索笔记
    { name: "搜索笔记", params: { keyword: "原神", page: "1" } },
  ];

  for (const tc of testCases) {
    const ep = XhsApiEndpoints.find((e) => e.name === tc.name);
    const label = ep?.status === "verified" ? "✅" : ep?.status === "risk_ctrl" ? "⛔" : "🔶";

    process.stdout.write(`  ${label} ${tc.name.padEnd(12)} ... `);

    try {
      const start = Date.now();
      const result = await crawler.fetchApi(tc.name, tc.params, crawlerSession, tc.authMode ?? "logged_in");
      const elapsed = Date.now() - start;

      let code: number | string = "?";
      let msg = "";
      try {
        const body = JSON.parse(result.body);
        code = body.code ?? body.status_code ?? "?";
        msg = (body.msg || body.message || body.msg_info || "").slice(0, 60);
      } catch {
        code = result.statusCode;
        msg = result.body.slice(0, 60);
      }

      const statusIcon = code === 0 || code === "0" ? "✅" : code === 300011 ? "⛔" : code === -1 ? "🔶" : "?";
      console.log(`${statusIcon} code=${code} ${msg ? `"${msg}"` : ""} (${elapsed}ms)`);

    } catch (e: any) {
      console.log(`❌ 异常: ${e.message.slice(0, 80)}`);
    }
  }

  console.log("\n═══════════════════════════════════════════\n");

  // 输出端点状态表
  console.log("端点状态汇总:\n");
  console.log("  Endpoint                    | Status     | Code | Note");
  console.log("  ───────────────────────────┼────────────┼──────┼─────");
  for (const ep of XhsApiEndpoints) {
    const icon = ep.status === "verified" ? "✅" : ep.status === "risk_ctrl" ? "⛔" : "🔶";
    console.log(`  ${icon} ${ep.name.padEnd(27)} | ${ep.status?.padEnd(10) || "─".padEnd(10)} |      |`);
  }
  console.log();
})().catch((e) => {
  console.error("❌ 验证失败:", e.message);
  process.exit(1);
});
