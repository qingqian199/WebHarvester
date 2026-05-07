import fs from "fs";
import path from "path";

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

export interface CalibrateResult {
  matchedCount: number;
  missingCount: number;
  matchedEndpoints: string[];
  missingEndpoints: Array<{ path: string; method: string; params: string[]; fieldCount: number }>;
  filesUpdated: string[];
}

const STATIC_EXT = new Set([".js", ".css", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".woff", ".woff2", ".ttf", ".eot", ".mp4", ".webm", ".webp", ".avif"]);

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

function capitalize(s: string): string {
  return s.split("_").map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1)).join("");
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

export async function runCalibrate(harvestFile: string, siteName: string): Promise<CalibrateResult> {
  const raw = fs.readFileSync(harvestFile, "utf-8");
  const harvest: HarvestResult = JSON.parse(raw);
  const requests = harvest.networkRequests || [];

  const apiReqs = requests.filter((r) => {
    if (STATIC_EXT.has(path.extname(new URL(r.url).pathname).toLowerCase())) return false;
    if (r.resourceType === "document" || r.resourceType === "stylesheet" || r.resourceType === "font") return false;
    if (r.statusCode < 200 || r.statusCode >= 400) return false;
    const p = normalizePath(r.url);
    if (!p || p === "/") return false;
    if (EXCLUDE_PREFIXES.some((x) => p.startsWith(x))) return false;
    return true;
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

  const crawlerPath = path.resolve("src/adapters/crawlers", `${capitalize(siteName)}Crawler.ts`);
  const missingEndpoints: CalibrateResult["missingEndpoints"] = [];
  const matchedEndpoints: string[] = [];

  if (fs.existsSync(crawlerPath)) {
    const source = fs.readFileSync(crawlerPath, "utf-8");
    const knownPaths = new Set<string>();
    const epMatch = source.matchAll(/path:\s*"([^"]+)"/g);
    for (const m of epMatch) knownPaths.add(m[1]);

    for (const [p, ep] of epMap) {
      if (knownPaths.has(p)) {
        matchedEndpoints.push(p);
      } else if (VALUABLE_MISSING.has(p)) {
        const fields = ep.sampleBody ? flattenFields(ep.sampleBody) : [];
        missingEndpoints.push({ path: p, method: ep.method, params: ep.params, fieldCount: fields.length });
      }
    }

    // Auto-fix: insert missing endpoints
    if (missingEndpoints.length > 0) {
      const marker = source.includes("export const BossApiEndpoints") ? "export const BossApiEndpoints" : "export const " + capitalize(siteName) + "ApiEndpoints";
      const arrStart = source.indexOf(marker);
      const arrEnd = source.indexOf("];", arrStart);
      if (arrEnd !== -1) {
        const inserts = missingEndpoints.map((ep) => {
          const epName = ep.path.split("/").pop()?.replace(/\.json$/, "").replace(/[^a-zA-Z0-9_]/g, "_") || "unknown";
          const pStr = ep.params.length > 0 ? ep.params.map((p) => `${p}={${p}}`).join("&") : "";
          const mField = ep.method !== "GET" ? `, method: "${ep.method}"` : "";
          const pField = pStr ? `, params: "${pStr}"` : "";
          return `  { name: "${epName}", path: "${ep.path}"${pField}${mField}, status: "sig_pending" }`;
        });
        const newSource = source.slice(0, arrEnd) + "\n" + inserts.join(",\n") + "\n" + source.slice(arrEnd);
        fs.writeFileSync(crawlerPath, newSource, "utf-8");
      }
    }
  }

  const filesUpdated = [crawlerPath];
  const yamlPath = path.resolve("output", siteName, "fields.yaml");
  if (fs.existsSync(path.dirname(yamlPath))) {
    let yc = "";
    if (fs.existsSync(yamlPath)) yc = fs.readFileSync(yamlPath, "utf-8") + "\n";
    yc += "# --- calibrate 补充 ---\n";
    for (const ep of missingEndpoints) {
      yc += `\n  - endpoint: "${ep.path}"\n    method: ${ep.method}\n    params:\n`;
      if (ep.params.length > 0) { for (const p of ep.params) yc += `      - name: "${p}"\n        required: false\n`; }
      else { yc += "      # 无参数\n"; }
    }
    fs.writeFileSync(yamlPath, yc, "utf-8");
    filesUpdated.push(yamlPath);
  }

  return {
    matchedCount: matchedEndpoints.length,
    missingCount: missingEndpoints.length,
    matchedEndpoints,
    missingEndpoints,
    filesUpdated,
  };
}
