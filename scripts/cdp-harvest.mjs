// CDP Harvest Worker — runs under Node.js for CDP connections (Bun WS incompatible)
// Usage: node scripts/cdp-harvest.mjs <port> <url>
import { chromium } from "playwright";
const port = parseInt(process.argv[2] || "9222");
const url = process.argv[3] || "";
if (!url) { console.log(JSON.stringify({ success: false, error: "No URL" })); process.exit(1); }
async function main() {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 15000 });
  const page = await (browser.contexts()[0] || await browser.newContext()).newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  const data = await page.evaluate(() => ({
    title: document.title, html: document.documentElement.outerHTML.slice(0, 100000),
    text: document.body?.innerText?.slice(0, 50000) || "", url: location.href,
  }));
  await browser.close();
  console.log(JSON.stringify({ success: true, ...data }));
  process.exit(0);
}
main().catch(e => { console.log(JSON.stringify({ success: false, error: e.message })); process.exit(1); });
