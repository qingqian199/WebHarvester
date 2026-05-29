// CDP Enhanced Harvest Worker — full network capture under Node.js
// Usage: node scripts/cdp-harvest.mjs <port> <url> [outputDir]
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const port = parseInt(process.argv[2] || "9222");
const url = process.argv[3] || "";
const outDir = resolve(process.argv[4] || "output");
if (!url) { console.log(JSON.stringify({ success: false, error: "No URL" })); process.exit(1); }

// ── Anti-crawl detection rules ──
const ANTI_CRAWL_PATTERNS = [
  { name: "CloudFront WAF", header: "x-amz-cf-id", desc: "请求经过 CloudFront WAF，可能被 CDN 层拦截" },
  { name: "Cloudflare", header: "cf-ray", desc: "请求经过 Cloudflare CDN" },
  { name: "Akamai", header: "x-akamai-", desc: "Akamai CDN 防护" },
  { name: "WAF 拦截", status: 403, bodyPattern: /cloudfront|waf|security|blocked|denied/i, desc: "WAF 返回 403 拦截" },
  { name: "WAF 拦截", status: 503, bodyPattern: /cloudfront|waf|security|blocked|denied/i, desc: "WAF 返回 503 临时封锁" },
  { name: "速率限制", status: 429, desc: "触发了频率限制" },
  { name: "验证码", bodyPattern: /captcha|verify|geetest|turnstile|recaptcha|人机验证|验证码/i, desc: "页面包含验证码" },
  { name: "Cookie 验证", header: "set-cookie", bodyPattern: /__cfduid|__cf_bm|_cfuvid/i, desc: "Cloudflare Cookie 验证" },
];

function detectAntiCrawl(entries, pageData) {
  const findings = [];
  const seenHeaders = new Set();
  for (const e of entries) {
    for (const rule of ANTI_CRAWL_PATTERNS) {
      const key = rule.name;
      if (seenHeaders.has(key)) continue;
      if (rule.header && e.responseHeaders?.[rule.header]) {
        findings.push({ type: rule.name, detail: rule.desc, evidence: `${rule.header}: ${e.responseHeaders[rule.header]}` });
        seenHeaders.add(key);
      }
      if (rule.status && e.status === rule.status) {
        if (rule.bodyPattern && e.responseBody) {
          if (rule.bodyPattern.test(e.responseBody)) {
            findings.push({ type: rule.name, detail: rule.desc, evidence: `HTTP ${e.status} ${e.request.url}` });
            seenHeaders.add(key);
          }
        } else {
          findings.push({ type: rule.name, detail: rule.desc, evidence: `HTTP ${e.status} ${e.request.url}` });
          seenHeaders.add(key);
        }
      }
    }
  }
  if (pageData.title?.toLowerCase().includes("captcha") || pageData.title?.includes("验证")) {
    if (!findings.find((f) => f.type === "验证码")) {
      findings.push({ type: "验证码", detail: ANTI_CRAWL_PATTERNS.find((r) => r.name === "验证码").desc, evidence: `页面标题: ${pageData.title}` });
    }
  }
  return findings;
}

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
  } catch { /* CDP session */ }

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

  // Capture response bodies for text-based entries
  const textMimeTypes = ["application/json", "text/", "application/xml", "application/x-www-form-urlencoded"];
  if (cdpSession) {
    for (const entry of harEntries) {
      if (!entry.requestId || !entry.mimeType) continue;
      if (!textMimeTypes.some((t) => entry.mimeType.startsWith(t))) continue;
      if (entry.status >= 400) continue;
      try {
        const bodyResp = await cdpSession.send("Network.getResponseBody", { requestId: entry.requestId });
        if (bodyResp?.body) {
          entry.responseBody = bodyResp.body.length > 50000 ? bodyResp.body.slice(0, 50000) : bodyResp.body;
          entry.responseBodyBase64 = bodyResp.base64Encoded || false;
        }
      } catch { /* body not available */ }
    }
  }
  await browser.close();

  // Anti-crawl detection
  const antiCrawlFindings = detectAntiCrawl(harEntries, pageData);

  // Save separate files
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const baseName = `cdp-harvest-${timestamp}`;
  mkdirSync(outDir, { recursive: true });

  // 1. Page data JSON
  writeFileSync(resolve(outDir, `${baseName}-page.json`), JSON.stringify({
    url: pageData.url, title: pageData.title, text: pageData.text, html: pageData.html,
    capturedAt: new Date().toISOString(), timing: Date.now() - startTime,
  }, null, 2), "utf-8");

  // 2. HAR (network log)
  writeFileSync(resolve(outDir, `${baseName}-har.json`), JSON.stringify({
    log: { version: "1.2", creator: { name: "WebHarvester CDP Worker", version: "1.0" }, entries: harEntries.map((e) => ({
      request: { url: e.request?.url, method: e.request?.method, headers: e.request?.headers, postData: e.request?.postData },
      response: { status: e.status, statusText: e.statusText, headers: e.responseHeaders, content: e.responseBody ? { text: e.responseBody, encoding: e.responseBodyBase64 ? "base64" : undefined } : undefined, mimeType: e.mimeType },
      time: e.responseTimeMs ? Math.max(1, e.responseTimeMs - e.timeMs) : undefined,
      _resourceType: e.resourceType, _requestId: e.requestId,
    })) },
  }, null, 2), "utf-8");

  // 3. Screenshot
  let screenshotFile = null;
  if (screenshot) {
    screenshotFile = `${baseName}-screenshot.png`;
    writeFileSync(resolve(outDir, screenshotFile), screenshot);
  }

  // 4. Anti-crawl report
  writeFileSync(resolve(outDir, `${baseName}-anticrawl.json`), JSON.stringify({
    detected: antiCrawlFindings.length > 0,
    findings: antiCrawlFindings,
    timestamp: new Date().toISOString(),
  }, null, 2), "utf-8");

  console.log(JSON.stringify({
    success: true, title: pageData.title, textLength: pageData.text.length,
    harCount: harEntries.length, hasScreenshot: !!screenshot,
    antiCrawlDetected: antiCrawlFindings.length > 0,
    antiCrawlFindings: antiCrawlFindings.map((f) => f.type),
    files: { page: `${baseName}-page.json`, har: `${baseName}-har.json`, screenshot: screenshotFile, anticrawl: `${baseName}-anticrawl.json` },
    timing: Date.now() - startTime + "ms",
  }));
  process.exit(0);
}
main().catch((e) => { console.log(JSON.stringify({ success: false, error: e.message })); process.exit(1); });
