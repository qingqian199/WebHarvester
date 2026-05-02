/**
 * 小红书签名注入验证脚本。
 * 用 Playwright 浏览器 + 签名注入，验证三个 🔶 端点返回 code=0。
 *
 * 用法: npx ts-node scripts/verify-xhs-sign-injection.ts
 */
import fs from "fs/promises";
import path from "path";
import { chromium } from "playwright";
import { RealisticFingerprintProvider } from "../src/adapters/RealisticFingerprintProvider";
import { FileSessionManager } from "../src/adapters/FileSessionManager";
import { setupSignatureInjection } from "../src/utils/crypto/xhs-sign-injector";

const XHS_API_HOST = "edith.xiaohongshu.com";

(async () => {
  console.log("═══════════════════════════════════════════");
  console.log("  小红书签名注入验证");
  console.log("═══════════════════════════════════════════\n");

  // 加载 session
  const sm = new FileSessionManager();
  const profiles = await sm.listProfiles();
  const xhsProfile = profiles.find((p) => p.includes("xiaohongshu"));
  if (!xhsProfile) { console.error("❌ 未找到小红书会话"); process.exit(1); }
  const sessionState = await sm.load(xhsProfile);
  if (!sessionState) { console.error("❌ 无法加载会话"); process.exit(1); }
  console.log(`📂 已加载会话: ${xhsProfile}`);
  console.log();

  // 启动浏览器
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // 注入 cookies
  if (sessionState.cookies.length > 0) {
    await context.addCookies(
      sessionState.cookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain || ".xiaohongshu.com",
        path: "/",
      })),
    );
  }

  // 注入 localStorage
  if (sessionState.localStorage) {
    await page.goto("https://www.xiaohongshu.com");
    await page.evaluate((ls) => {
      for (const [k, v] of Object.entries(ls)) {
        try { localStorage.setItem(k, v); } catch {}
      }
    }, sessionState.localStorage);
  }

  const fp = new RealisticFingerprintProvider().getFingerprint();
  const injectorDisable = setupSignatureInjection(page, {
    cookies: sessionState.cookies,
    localStorage: sessionState.localStorage,
  }, fp.userAgent, fp.platform);

  // 记录 API 响应
  const apiResults: Array<{ path: string; method: string; code: number; msg: string }> = [];

  page.on("response", async (res) => {
    const url = res.url();
    try {
      const parsed = new URL(url);
      if (parsed.hostname !== XHS_API_HOST || !parsed.pathname.startsWith("/api/")) return;
      const text = await res.text();
      try {
        const json = JSON.parse(text);
        if (json.code !== undefined) {
          apiResults.push({
            path: parsed.pathname,
            method: res.request().method(),
            code: json.code,
            msg: (json.msg || json.msg_info || json.message || "").slice(0, 40),
          });
        }
      } catch {}
    } catch {}
  });

  // 触发各个端点
  // 1. search/onebox (POST) — 通过搜索页面触发
  console.log("⏳ 正在打开搜索页面（触发 search/onebox）...");
  await page.goto("https://www.xiaohongshu.com/search_result?keyword=原神", { waitUntil: "domcontentloaded", timeout: 30000 });
  await new Promise((r) => setTimeout(r, 3000));

  // 2. search/filter — 搜索页面也会触发 filter
  // 3. board/user — 需要打开用户主页
  // 先从 API 响应中提取 user_id
  let userId = "";
  // 先调用 user/me 获取用户信息
  console.log("⏳ 正在获取用户信息...");
  try {
    const meRes = await page.evaluate(async () => {
      const r = await fetch("https://edith.xiaohongshu.com/api/sns/web/v2/user/me", {
        credentials: "include",
        headers: { "accept": "application/json" },
      });
      return r.json();
    });
    userId = meRes?.data?.user_id || meRes?.data?.userId || "";
    console.log(`   用户 ID: ${userId || "未获取到"}`);
  } catch {}

  if (userId) {
    console.log("⏳ 正在打开用户收藏页（触发 board/user）...");
    await page.goto(`https://www.xiaohongshu.com/user/profile/${userId}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await new Promise((r) => setTimeout(r, 3000));
  }

  // 等待 API 完成
  await new Promise((r) => setTimeout(r, 2000));
  injectorDisable();
  await browser.close();

  // 输出结果
  console.log("\n📡 API 响应汇总:\n");
  const targetPaths = [
    "/api/sns/web/v1/search/onebox",
    "/api/sns/web/v1/search/filter",
    "/api/sns/web/v1/board/user",
  ];

  for (const tPath of targetPaths) {
    const results = apiResults.filter((r) => r.path === tPath);
    const statusIcon = results.some((r) => r.code === 0) ? "✅" : results.length > 0 ? "🔶" : "⚠️";
    console.log(`  ${statusIcon} ${tPath}`);
    if (results.length > 0) {
      for (const r of results) {
        const icon = r.code === 0 ? "✅" : r.code === 300011 ? "⛔" : "🔶";
        console.log(`     ${icon} ${r.method} code=${r.code} "${r.msg}"`);
      }
    } else {
      console.log(`     ⚠️ 未捕获到该 API 请求`);
    }
  }

  console.log("\n📊 全部 API 响应:");
  for (const r of apiResults) {
    const icon = r.code === 0 ? "✅" : r.code === 300011 ? "⛔" : "🔶";
    console.log(`  ${icon} ${r.method} ${r.path} → code=${r.code} "${r.msg}"`);
  }

  console.log("\n═══════════════════════════════════════════\n");
})().catch((e) => {
  console.error("❌ 失败:", e.message);
  process.exit(1);
});
