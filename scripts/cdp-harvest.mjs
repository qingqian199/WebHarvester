// CDP Enhanced Harvest Worker — full network capture under Node.js
// Usage: node scripts/cdp-harvest.mjs <port> <url> [outputDir]
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const port = parseInt(process.argv[2] || "9222");
const url = process.argv[3] || "";
const outDir = resolve(process.argv[4] || "output");
if (!url) { console.log(JSON.stringify({ success: false, error: "No URL" })); process.exit(1); }

async function main() {
  const startTime = Date.now();
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 15000 });
  const context = browser.contexts()[0] || await browser.newContext();
  const page = await context.newPage();

  // Network capture via CDP session
  const harEntries = [];
  let cdpSession = null;
  try {
    cdpSession = await context.newCDPSession(page);
    await cdpSession.send("Network.enable");
    cdpSession.on("Network.requestWillBeSent", (p) => {
      harEntries.push({ type: "request", timeMs: Date.now() - startTime, request: { url: p.request.url, method: p.request.method, headers: p.request.headers, postData: p.request.postData }, requestId: p.requestId, resourceType: p.type });
    });
    cdpSession.on("Network.responseReceived", (p) => {
      const e = harEntries.find((x) => x.requestId === p.requestId);
      if (e) { e.status = p.response.status; e.statusText = p.response.statusText; e.responseHeaders = p.response.headers; e.mimeType = p.response.mimeType; e.responseTimeMs = Date.now() - startTime; }
    });
  } catch (e) { /* CDP session not available in some connectOverCDP modes */ }

  // Navigate
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 2000));

  // Extract page data
  const pageData = await page.evaluate(() => ({
    title: document.title, html: document.documentElement.outerHTML.slice(0, 100000),
    text: document.body?.innerText?.slice(0, 50000) || "", url: location.href,
  }));
  const screenshot = await page.screenshot({ type: "png", fullPage: false }).catch(() => null);

  await browser.close();

  const result = { success: true, ...pageData, har: { totalRequests: harEntries.length, entries: harEntries }, screenshot: screenshot ? screenshot.toString("base64") : null, timing: Date.now() - startTime };
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `cdp-enhanced-${timestamp}.json`;
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, filename), JSON.stringify(result, null, 2), "utf-8");

  console.log(JSON.stringify({ success: true, title: pageData.title, textLength: pageData.text.length, harCount: harEntries.length, hasScreenshot: !!screenshot, timing: result.timing + "ms", savedAs: filename }));
  process.exit(0);
}
main().catch(e => { console.log(JSON.stringify({ success: false, error: e.message })); process.exit(1); });
