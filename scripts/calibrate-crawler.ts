/**
 * 特化爬虫校准器。
 * 读取全量采集结果，对比特化爬虫现有配置，自动补充缺失端点和字段。
 *
 * 用法:
 *   ts-node scripts/calibrate-crawler.ts <harvestFile> <siteName> [--dry-run]
 */
import fs from "fs";
import path from "path";

const [, , harvestFile, siteName, dryRunFlag] = process.argv;
const dryRun = dryRunFlag === "--dry-run";

if (!harvestFile || !siteName) {
  console.error("用法: ts-node scripts/calibrate-crawler.ts <harvestFile> <siteName> [--dry-run]");
  process.exit(1);
}

interface NetworkRequest {
  url: string;
  method: string;
  statusCode: number;
  requestHeaders: Record<string, string>;
  requestBody?: unknown;
  responseBody?: unknown;
  resourceType?: string;
  timestamp: number;
}

interface HarvestResult {
  traceId: string;
  targetUrl: string;
  networkRequests: NetworkRequest[];
  elements: Array<{ tagName: string; selector: string; attributes: Record<string, string>; text?: string }>;
  storage: { localStorage: Record<string, string>; sessionStorage: Record<string, string>; cookies: Array<{ name: string; value: string; domain: string }> };
}

interface BossEndpointDef {
  name: string;
  path: string;
  method?: string;
  params?: string;
  status?: string;
  proxyRequired?: boolean;
}

const KNOWN_ENDPOINTS: BossEndpointDef[] = [
  { name: "城市列表", path: "/wapi/zpCommon/data/cityGroup.json", status: "verified" },
  { name: "城市站点", path: "/wapi/zpgeek/common/data/city/site.json", status: "verified" },
  { name: "默认城市", path: "/wapi/zpgeek/common/data/defaultcity.json", status: "verified" },
  { name: "职类筛选条件", path: "/wapi/zpgeek/pc/all/filter/conditions.json", status: "verified" },
  { name: "行业过滤列表", path: "/wapi/zpCommon/data/industryFilterExemption", status: "verified" },
  { name: "页面头部", path: "/wapi/zpgeek/common/data/header.json", status: "verified" },
  { name: "页面底部", path: "/wapi/zpgeek/common/data/footer.json", status: "verified" },
  { name: "Banner查询", path: "/wapi/zpgeek/webtopbanner/query.json", status: "verified" },
  { name: "搜索职位", path: "/wapi/zpgeek/search/joblist.json", params: "query={keyword}&page={page}&city={city}", status: "verified", proxyRequired: true },
  { name: "职位详情", path: "/wapi/zpgeek/search/detail.json", params: "jobId={jobId}", status: "verified", proxyRequired: true },
  { name: "公司信息", path: "/wapi/zpgeek/search/geek.json", params: "jobId={jobId}", status: "verified", proxyRequired: true },
  { name: "安全引导", path: "/wapi/zpuser/wap/getSecurityGuideV1", status: "verified" },
];

const KNOWN_PATHS = new Set(KNOWN_ENDPOINTS.map((e) => e.path));

const EXCLUDE_PREFIXES = ["/static/", "/dap/", "/wflow/", "/wapi/dapCommon/", "/wapi/zpCommon/actionLog/", "/wapi/zpCommon/toggle/", "/wapi/zppassport/", "/wapi/zpApm/", "/wapi/certification/"];

const VALUABLE_MISSING = new Set([
  "/wapi/zpgeek/job/detail.json",
  "/wapi/zpgeek/pc/recommend/job/list.json",
  "/wapi/zpgeek/pc/recommend/expect/list.json",
  "/wapi/zpuser/wap/getUserInfo.json",
  "/wapi/zpchat/notify/setting/get",
  "/wapi/zpgeek/resume/restrict/list.json",
  "/wapi/zpgeek/resume/complete/step.json",
  "/wapi/zpgeek/search/job/seo/data.json",
  "/wapi/zpgeek/search/job/sidebar.json",
  "/wapi/zpgeek/search/job/tdk.json",
  "/wapi/zpgeek/agreement/update/tip.json",
  "/wapi/zpgeek/resume/parser/querybar.json",
  "/wapi/zpitem/geek/vip/info",
  "/wapi/zpuser/h5/account/getStatus",
  "/wapi/zpwukong/web/employer/task/showGeekEntry",
  "/web/common/data/geek-job/flag-list.json",
]);

const STATIC_EXT = new Set([".js", ".css", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".woff", ".woff2", ".ttf", ".eot", ".mp4", ".webm", ".webp", ".avif"]);

function isStaticAsset(url: string): boolean {
  try { return STATIC_EXT.has(path.extname(new URL(url).pathname).toLowerCase()); } catch { return false; }
}

function normalizePath(url: string): string {
  try { return new URL(url).pathname; } catch { return url; }
}

function extractParams(url: string): string[] {
  try { return [...new URL(url).searchParams.keys()].filter((k) => k !== "_"); } catch { return []; }
}

function flattenFields(dataStr: unknown, prefix = ""): string[] {
  let obj: unknown;
  if (typeof dataStr === "string") { try { obj = JSON.parse(dataStr); } catch { return []; } } else { obj = dataStr; }
  const fields: string[] = [];
  if (Array.isArray(obj)) {
    fields.push(prefix + "[]");
    if (obj.length > 0 && typeof obj[0] === "object" && obj[0] !== null) flattenFields(obj[0], prefix + "[].").forEach((f) => fields.push(f));
  } else if (obj !== null && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const fp = prefix ? `${prefix}.${k}` : k;
      fields.push(fp);
      if (Array.isArray(v)) { fields.push(fp + "[]"); if (v.length > 0 && typeof v[0] === "object" && v[0] !== null) flattenFields(v[0], fp + "[].").forEach((f) => fields.push(f)); }
      else if (v !== null && typeof v === "object") flattenFields(v, fp).forEach((f) => fields.push(f));
    }
  }
  return fields;
}

function capitalize(s: string): string {
  return s.split("_").map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1)).join("");
}

function inferEndpointName(p: string): string {
  const segments = p.replace(/\/wapi\/?/, "").replace(/\.json$/, "").split("/").filter(Boolean);
  if (segments.length === 0) return "index";
  const name = segments.map((s) => s.replace(/^(zpgeek|zpcommon|zpuser|web|api|wap|v\d+)/, "")).filter(Boolean).join("_") || segments[segments.length - 1];
  return name.replace(/[^a-zA-Z0-9_]/g, "_");
}

function shouldExclude(p: string): boolean {
  return EXCLUDE_PREFIXES.some((x) => p.startsWith(x)) || p === "/" || !p;
}

function main(): void {
  console.log(`\n🔍 特化爬虫校准器 — ${siteName}${dryRun ? " (dry-run)" : ""}`);
  console.log(`   全量采集文件: ${harvestFile}\n`);

  const raw = fs.readFileSync(harvestFile, "utf-8");
  const harvest: HarvestResult = JSON.parse(raw);

  const apiReqs = harvest.networkRequests.filter((r) => {
    if (isStaticAsset(r.url)) return false;
    if (r.resourceType === "document" || r.resourceType === "stylesheet" || r.resourceType === "font") return false;
    if (r.statusCode < 200 || r.statusCode >= 400) return false;
    const p = normalizePath(r.url);
    return !shouldExclude(p);
  });

  const epMap = new Map<string, { path: string; method: string; params: string[]; count: number; sampleBody: unknown }>();
  for (const req of apiReqs) {
    const p = normalizePath(req.url);
    const ex = epMap.get(p);
    if (ex) {
      ex.count++;
      if (!ex.sampleBody && req.responseBody) ex.sampleBody = req.responseBody;
      extractParams(req.url).forEach((param) => { if (!ex.params.includes(param)) ex.params.push(param); });
    } else {
      epMap.set(p, { path: p, method: req.method, params: extractParams(req.url), count: 1, sampleBody: req.responseBody || undefined });
    }
  }

  const allEps = [...epMap.values()].sort((a, b) => a.path.localeCompare(b.path));
  const matched: typeof allEps = [];
  const missing: typeof allEps = [];

  for (const ep of allEps) {
    if (KNOWN_PATHS.has(ep.path)) { matched.push(ep); }
    else if (VALUABLE_MISSING.has(ep.path)) { missing.push(ep); }
  }

  console.log("=".repeat(60));
  console.log("  1. 已匹配端点");
  console.log("=".repeat(60));
  for (const m of matched) console.log(`  ✅ ${KNOWN_ENDPOINTS.find((k) => k.path === m.path)?.name}  (${m.count}次)`);

  console.log(`\n${"=".repeat(60)}`);
  console.log("  2. 缺失业务端点");
  console.log("=".repeat(60));
  for (const ep of missing) {
    const fields = ep.sampleBody ? flattenFields(ep.sampleBody) : [];
    console.log(`  📌 ${ep.path}`);
    console.log(`     方法: ${ep.method}, ${ep.count}次, 参数: ${ep.params.join(", ") || "无"}`);
    if (fields.length > 0) console.log(`     字段: ${fields.slice(0, 8).join(", ")}${fields.length > 8 ? `...+${fields.length - 8}` : ""}`);
    console.log();
  }

  if (!dryRun && missing.length > 0) {
    const crawlerPath = path.resolve("src/adapters/crawlers", `${capitalize(siteName)}Crawler.ts`);
    let source = fs.readFileSync(crawlerPath, "utf-8");

    const marker = source.includes("export const BossApiEndpoints") ? "export const BossApiEndpoints" : "export const " + capitalize(siteName) + "ApiEndpoints";
    const arrStart = source.indexOf(marker);
    const arrEnd = source.indexOf("];", arrStart);

    if (arrEnd !== -1) {
      const inserts = missing.map((ep) => {
        const epName = inferEndpointName(ep.path);
        const pStr = ep.params.length > 0 ? ep.params.map((p) => `${p}={${p}}`).join("&") : "";
        const mField = ep.method !== "GET" ? `, method: "${ep.method}"` : "";
        const pField = pStr ? `, params: "${pStr}"` : "";
        return `  { name: "${epName}", path: "${ep.path}"${pField}${mField}, status: "sig_pending" }`;
      });
      source = source.slice(0, arrEnd) + "\n" + inserts.join(",\n") + "\n" + source.slice(arrEnd);
      fs.writeFileSync(crawlerPath, source, "utf-8");
      console.log(`  ✅ 已更新 ${crawlerPath} (+${missing.length} 端点)`);
    }

    const yamlPath = path.resolve("output", siteName, "fields.yaml");
    if (!fs.existsSync(path.dirname(yamlPath))) fs.mkdirSync(path.dirname(yamlPath), { recursive: true });
    let yc = "";
    if (fs.existsSync(yamlPath)) yc = fs.readFileSync(yamlPath, "utf-8") + "\n";
    yc += "# --- calibrate-crawler.ts ---\n";
    for (const ep of missing) {
      yc += `\n  - endpoint: "${ep.path}"\n    method: ${ep.method}\n    params:\n`;
      if (ep.params.length > 0) { for (const p of ep.params) yc += `      - name: "${p}"\n        required: false\n`; }
      else { yc += "      # 无参数\n"; }
      yc += "    response_fields:\n";
      const flds = ep.sampleBody ? flattenFields(ep.sampleBody) : [];
      for (const f of flds.slice(0, 30)) yc += `      - name: "${f}"\n        selected: false\n`;
      if (flds.length > 30) yc += `      # ... +${flds.length - 30}\n`;
    }
    fs.writeFileSync(yamlPath, yc, "utf-8");
    console.log(`  ✅ 已更新 ${yamlPath}`);

    console.log("\n  📋 在 ContentUnit.ts 的 BossContentUnit 类型中添加:");
    for (const ep of missing) {
      const n = ep.path.split("/").pop()?.replace(/\.json$/, "").replace(/[^a-zA-Z0-9_]/g, "_") || "unknown";
      console.log(`  | "boss_${n}"`);
    }
  }

  console.log(`\n📊 已匹配 ${matched.length}, 缺失 ${missing.length}, 总计 ${allEps.length}\n`);
}

main();
