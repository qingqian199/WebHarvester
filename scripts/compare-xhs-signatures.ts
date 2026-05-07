/**
 * 小红书签名对比脚本。
 * 用通用浏览器引擎打开小红书页面，捕获真实 X-s 签名（SDK 修改后），
 * 与 xhs-signer.ts 生成的签名逐字节对比。
 *
 * 用法: npx ts-node scripts/compare-xhs-signatures.ts
 */
import { PlaywrightAdapter } from "../src/adapters/PlaywrightAdapter";
import { ConsoleLogger } from "../src/adapters/ConsoleLogger";
import { FileSessionManager } from "../src/adapters/FileSessionManager";
import { generateXsHeader } from "../src/utils/crypto/xhs-signer";

function byteDiff(expected: string, actual: string): string[] {
  const lines: string[] = [];
  const maxLen = Math.max(expected.length, actual.length);
  for (let i = 0; i < maxLen; i++) {
    const e = expected[i] || "(missing)";
    const a = actual[i] || "(missing)";
    if (e !== a) {
      lines.push(`  pos ${i}: expected "${e}" (0x${e.charCodeAt(0).toString(16)}) vs actual "${a}" (0x${a.charCodeAt(0).toString(16)})`);
    }
  }
  return lines;
}

(async () => {
  console.log("═══════════════════════════════════════════");
  console.log("  小红书签名对比");
  console.log("═══════════════════════════════════════════\n");

  // 加载 session
  const sm = new FileSessionManager();
  const profileList = await sm.listProfiles();
  const xhsProfile = profileList.find((p) => p.includes("xiaohongshu"));
  if (!xhsProfile) {
    console.error("❌ 未找到小红书会话");
    process.exit(1);
  }
  const sessionState = await sm.load(xhsProfile);
  if (!sessionState) {
    console.error("❌ 无法加载会话");
    process.exit(1);
  }
  console.log(`📂 已加载会话: ${xhsProfile}`);
  console.log(`   Cookie: ${sessionState.cookies.length} 个`);
  console.log();

  // 用通用引擎采集小红书用户主页，触发 API 请求
  const logger = new ConsoleLogger("info");
  const browser = new PlaywrightAdapter(logger);

  console.log("⏳ 正在打开小红书...");
  await browser.launch("https://www.xiaohongshu.com/explore", sessionState);

  // 等待页面加载 + API 请求完成
  console.log("⏳ 等待 5s 让 API 请求完成...");
  await new Promise((r) => setTimeout(r, 5000));

  const requests = await browser.captureNetworkRequests({ captureAll: true });
  await browser.close();

  // 分析结果
  const apiRequests = requests.filter((r) => r.url.includes("edith.xiaohongshu.com"));
  console.log(`\n📡 捕获到 ${apiRequests.length} 个 API 请求`);
  const realCount = apiRequests.filter((r) => (r.requestHeaders || {})._realHeader === "1").length;
  console.log(`   含 _realHeader 标记: ${realCount} 个\n`);

  let foundReal = false;
  for (const req of apiRequests) {
    const headers = req.requestHeaders || {};
    const isReal = headers._realHeader === "1";
    const realXs = headers["x-s"] || headers["X-s"] || "";
    const realXt = headers["x-t"] || headers["X-t"] || "";
    const realCommon = headers["x-s-common"] || headers["X-s-common"] || "";
    const _hasCookie = Object.keys(headers).some((k) => k.toLowerCase() === "cookie");

    if (!isReal || !realXs) continue;
    foundReal = true;

    const url = new URL(req.url);
    const apiPath = url.pathname;
    const data = url.search.replace("?", "");
    const cookieStr = headers["cookie"] || "";
    const a1Match = cookieStr.match(/a1=([^;]+)/);
    const a1 = a1Match ? a1Match[1] : "";

    console.log(`─── ${req.method} ${apiPath} ───`);
    console.log(`  真实 X-s (前 40 字符): ${realXs.slice(0, 40)}...`);
    console.log(`  真实 X-t: ${realXt}`);
    console.log(`  真实 X-s-common: ${realCommon.slice(0, 40)}...`);
    console.log(`  API Path for signing: "${apiPath}"`);
    console.log(`  Data for signing: "${data}"`);
    console.log(`  a1: "${a1.slice(0, 20)}..."`);

    // 用我们的生成器生成签名
    const cookieMap: Record<string, string> = { a1 };
    const ourHeaders = generateXsHeader(apiPath, data, cookieMap);
    console.log(`  生成 X-s (前 40 字符): ${ourHeaders["X-s"].slice(0, 40)}...`);
    console.log(`  生成 X-t: ${ourHeaders["X-t"]}`);

    // 对比
    if (ourHeaders["X-s"] === realXs) {
      console.log("  ✅ X-s 完全一致！");
    } else {
      console.log("  ❌ X-s 不一致！");
      const diffs = byteDiff(ourHeaders["X-s"], realXs);
      diffs.slice(0, 10).forEach((d) => console.log(d));
      if (diffs.length > 10) console.log(`  ... 还有 ${diffs.length - 10} 处差异`);
    }

    if (ourHeaders["X-t"] !== realXt) {
      console.log(`  ❌ X-t 不一致: 生成=${ourHeaders["X-t"]}, 真实=${realXt}`);
      console.log("     (可能原因: 时间戳差异)");
    } else {
      console.log("  ✅ X-t 一致");
    }

    // 解析 X-s 内容
    try {
      const payload = realXs.replace("XYS_", "");
      const stdB64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
      const customB64 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";
      const standard = payload.replace(/./g, (c) => {
        const idx = customB64.indexOf(c);
        return idx >= 0 ? stdB64[idx] : c;
      });
      const decoded = Buffer.from(standard, "base64").toString("utf-8");
      console.log(`  真实 X-s payload: ${decoded.slice(0, 80)}...`);
    } catch {}

    console.log();
  }

  if (!foundReal) {
    console.log("⚠️ 未找到包含真实签名的 API 请求。");
    console.log("  可能原因: 小红书的安全 SDK 在内嵌请求中未触发签名修改，");
    console.log("  或 SDK 在当前页面上下文中未激活。");
  }

  console.log("═══════════════════════════════════════════\n");
})().catch((e) => {
  console.error("❌ 失败:", e.message);
  process.exit(1);
});
