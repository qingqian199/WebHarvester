/**
 * 从 Chrome 提取已登录站点的 Cookie 并保存到会话管理器。
 * 用法: node scripts/import-chrome-cookies.mjs
 * 要求: Chrome 已启动 --remote-debugging-port=9222
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const SITES = {
  bilibili: "https://www.bilibili.com",
  miyoushe: "https://www.miyoushe.com",
  boss_zhipin: "https://www.zhipin.com",
  zhihu: "https://www.zhihu.com",
  douyin: "https://www.douyin.com",
};

async function main() {
  const port = parseInt(process.argv[2] || "9222");
  console.log(`🔗 连接 Chrome (端口 ${port})...`);

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 10000 });
  const context = browser.contexts()[0] || await browser.newContext();
  console.log("✅ 已连接");

  const SESSION_DIR = resolve("sessions");
  mkdirSync(SESSION_DIR, { recursive: true });

  for (const [domain, url] of Object.entries(SITES)) {
    try {
      const cookies = await context.cookies(url);
      if (!cookies || cookies.length === 0) {
        console.log(`  ⏭️ ${domain}: 无 Cookie`);
        continue;
      }

      const valid = cookies.filter((c) => !(c.expires && c.expires <= Math.floor(Date.now() / 1000)));
      const profile = `${domain}:main`;
      const domainDir = resolve(SESSION_DIR, domain);
      mkdirSync(domainDir, { recursive: true });
      const filePath = resolve(domainDir, `main.json`);

      const state = {
        cookies: valid.map((c) => ({
          name: c.name, value: c.value, domain: c.domain || `.${domain}`,
          path: c.path || "/", secure: c.secure ?? false, httpOnly: c.httpOnly ?? false,
          sameSite: c.sameSite || "Lax",
        })),
        localStorage: {},
        sessionStorage: {},
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
      };

      writeFileSync(filePath, JSON.stringify(state, null, 2), "utf-8");
      console.log(`  ✅ ${domain}: ${valid.length} 个 Cookie → ${profile}`);
    } catch (e) {
      console.log(`  ❌ ${domain}: ${e.message}`);
    }
  }

  await browser.close();
  console.log("\n🎉 全部完成");
}

main().catch((e) => { console.error("❌", e.message); process.exit(1); });
