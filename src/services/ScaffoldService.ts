import fs from "fs";
import path from "path";

// ─── 类型 ──────────────────────────────────────────────────────────────

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

export interface ScaffoldResult {
  endpointsFound: number;
  antiCrawlDetected: string[];
  filesGenerated: string[];
  registrationGuide: string;
  siteName: string;
}

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

function capitalize(s: string): string {
  return s.split("_").map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1)).join("");
}

const ANTI_CRAWL_RULES = [
  { test: (url: string) => url.includes("w_rid=") && url.includes("wts="), name: "WBI 签名", severity: "high" },
  { test: (url: string) => url.toLowerCase().includes("x-s"), name: "小红书 X-s 签名", severity: "high" },
  { test: (url: string) => url.includes("x-zse-96"), name: "知乎 x-zse-96 签名", severity: "high" },
  { test: (url: string) => url.includes("traceid"), name: "请求头 traceid", severity: "medium" },
  { test: (url: string) => url.includes("captcha") || url.includes("geetest"), name: "验证码", severity: "medium" },
  { test: (url: string) => url.includes("xsec_token"), name: "小红书 xsec_token", severity: "low" },
  { test: (url: string) => url.includes("__zp_stoken__"), name: "BOSS __zp_stoken__", severity: "high" },
];

function detectAntiCrawl(requests: NetworkRequest[]): string[] {
  const detected = new Set<string>();
  for (const req of requests) {
    for (const rule of ANTI_CRAWL_RULES) {
      if (rule.test(req.url)) detected.add(`${rule.name} (${rule.severity})`);
    }
  }
  return [...detected];
}

export async function runScaffold(harvestFile: string, siteName: string): Promise<ScaffoldResult> {
  const raw = fs.readFileSync(harvestFile, "utf-8");
  const harvest: HarvestResult = JSON.parse(raw);
  const requests = harvest.networkRequests || [];

  const apiRequests = requests.filter((r) => {
    if (isStaticAsset(r.url)) return false;
    if (r.resourceType === "document" || r.resourceType === "stylesheet" || r.resourceType === "font") return false;
    if (r.statusCode < 200 || r.statusCode >= 400) return false;
    return true;
  });

  const endpoints = new Map<string, { path: string; method: string; params: string[]; count: number }>();
  for (const req of apiRequests) {
    const p = normalizePath(req.url);
    if (!p || p === "/") continue;
    const ex = endpoints.get(p);
    if (ex) { ex.count++; extractParams(req.url).forEach((param) => { if (!ex.params.includes(param)) ex.params.push(param); }); }
    else { endpoints.set(p, { path: p, method: req.method, params: extractParams(req.url), count: 1 }); }
  }

  const antiCrawl = detectAntiCrawl(requests);
  const filesGenerated = await generateCrawlerFile(siteName, [...endpoints.values()], antiCrawl);

  const registrationGuide = [
    `1. 在 src/core/models/ContentUnit.ts 中添加 ${capitalize(siteName)}ContentUnit 类型`,
    `2. 在 src/index.ts 中注册: d.register(new ${capitalize(siteName)}Crawler(globalProxyProvider))`,
    `3. 在 config.json 中添加: "${siteName}": "enabled"`,
    "4. 实现签名逻辑 (addAuthHeaders)",
  ].join("\n");

  return {
    endpointsFound: endpoints.size,
    antiCrawlDetected: antiCrawl,
    filesGenerated,
    registrationGuide,
    siteName,
  };
}

async function generateCrawlerFile(siteName: string, endpoints: Array<{ path: string; method: string; params: string[] }>, antiCrawl: string[]): Promise<string[]> {
  const className = `${capitalize(siteName)}Crawler`;
  const domain = `${siteName}.com`;
  const apiHost = `www.${domain}`;
  const siteUpper = siteName.toUpperCase().replace(/[^A-Z0-9_]/g, "_");

  const lines: string[] = [
    "import { CrawlerSession, PageData } from \"../../core/ports/ISiteCrawler\";",
    "import { IProxyProvider } from \"../../core/ports/IProxyProvider\";",
    "import { UnitResult } from \"../../core/models/ContentUnit\";",
    "import { getRateLimiter } from \"../../utils/rate-limiter\";",
    "import { BaseCrawler } from \"./BaseCrawler\";",
    "import { RateLimitMiddleware } from \"./middleware/RateLimitMiddleware\";",
    "import { BodyTruncationMiddleware } from \"./middleware/BodyTruncationMiddleware\";",
    "",
    `const ${siteUpper}_DOMAIN = "${domain}";`,
    `const ${siteUpper}_API_HOST = "${apiHost}";`,
    "",
    `export interface ${className}EndpointDef {`,
    "  name: string;",
    "  path: string;",
    "  method?: string;",
    "  params?: string;",
    "  status?: \"verified\" | \"sig_pending\";",
    "}",
    "",
    `export const ${capitalize(siteName)}ApiEndpoints: ReadonlyArray<${className}EndpointDef> = [`,
    ...endpoints.slice(0, 30).map((ep) => {
      const pStr = ep.params.length > 0 ? `, params: "${ep.params.map((p) => `${p}={${p}}`).join("&")}"` : "";
      const mStr = ep.method !== "GET" ? `, method: "${ep.method}"` : "";
      return `  { name: "${ep.path.split("/").pop()?.replace(/\.json$/, "") || "index"}", path: "${ep.path}"${pStr}${mStr} },`;
    }),
    "];",
    "",
    `export class ${className} extends BaseCrawler {`,
    `  readonly name = "${siteName}";`,
    `  readonly domain = ${siteUpper}_DOMAIN;`,
    "",
    "  constructor(proxyProvider?: IProxyProvider) {",
    `    super("${siteName}", proxyProvider);`,
    `    this.rateLimiter = getRateLimiter("${siteName}", {`,
    "      enabled: true, minDelay: 1500, maxDelay: 4000, cooldownMinutes: 15, maxConcurrentSignatures: 1, maxConcurrentPages: 1,",
    "    });",
    `    this.build${capitalize(siteName)}Pipeline();`,
    "  }",
    "",
    `  private build${capitalize(siteName)}Pipeline(): void {`,
    "    this.pipeline.clear();",
    ...(antiCrawl.length > 0 ? [`    // TODO: 注册签名中间件 (检测到 ${antiCrawl.join(", ")})`] : []),
    "    this.pipeline.use(new RateLimitMiddleware(this.rateLimiter));",
    "    this.pipeline.use(new BodyTruncationMiddleware(200000));",
    "  }",
    "",
    "  matches(url: string): boolean {",
    `    try { return new URL(url).hostname.includes(${siteUpper}_DOMAIN); }`,
    "    catch { return false; }",
    "  }",
    "",
    "  protected getReferer(_url: string): string {",
    `    return "https://www.${domain}/";`,
    "  }",
    "",
    "  protected addAuthHeaders(headers: Record<string, string>, _url: string, _method: string, _body: string, _session?: CrawlerSession): void {",
    "    headers[\"x-requested-with\"] = \"XMLHttpRequest\";",
    `    headers["Origin"] = "https://www.${domain}";`,
    `    headers["Referer"] = "https://www.${domain}/";`,
    "    headers[\"Accept\"] = \"application/json, text/plain, */*\";",
    ...(antiCrawl.length > 0 ? [`    // TODO: 实现签名: ${antiCrawl.join(", ")}`] : ["    // TODO: 注入签名头"]),
    "  }",
    "",
    "  async fetchApi(endpointName: string, params?: Record<string, string>, session?: CrawlerSession): Promise<PageData> {",
    `    const ep = ${capitalize(siteName)}ApiEndpoints.find((e) => e.name === endpointName);`,
    "    if (!ep) throw new Error(\"未知端点: \" + endpointName);",
    "    let query = ep.params || \"\";",
    "    if (params) for (const [k, v] of Object.entries(params)) query = query.replace(\"{\" + k + \"}\", encodeURIComponent(v));",
    `    return this.fetchWithRetry("https://" + ${siteUpper}_API_HOST + ep.path + (query ? "?" + query : ""), session);`,
    "  }",
    "",
    "  async fetchPageData(pageType: string, _params: Record<string, string>, session?: CrawlerSession): Promise<PageData> {",
    "    const { browser, startTime } = await this.fetchPageContent(",
    `      "https://www.${domain}/", session, ".${domain}"`,
    "    );",
    "    try {",
    "      const title = await browser.executeScript<string>(\"document.title\").catch(() => \"\");",
    "      const bodyText = await browser.executeScript<string>(\"document.body.innerText.slice(0,5000)\").catch(() => \"\");",
    "      return { url: \"\", statusCode: 200, body: JSON.stringify({title, content: bodyText}),",
    "        headers: {\"content-type\":\"application/json;charset=utf-8\"}, responseTime: Date.now()-startTime, capturedAt: new Date().toISOString() };",
    "    } finally { await browser.close(); }",
    "  }",
    "",
    "  async collectUnits(units: string[], params: Record<string, string>, session?: CrawlerSession, _authMode?: string): Promise<UnitResult<unknown>[]> {",
    "    const results: UnitResult[] = [];",
    "    for (const unit of units) {",
    "      const start = Date.now();",
    "      try {",
    "        switch (unit) {",
    "          default:",
    "            results.push({ unit, status: \"failed\", data: null, method: \"none\", error: \"未知单元: \" + unit, responseTime: 0 });",
    "        }",
    "      } catch (e: unknown) {",
    "        results.push({ unit, status: \"failed\", data: null, method: \"none\", error: (e as Error).message, responseTime: Date.now() - start });",
    "      }",
    "    }",
    "    return results;",
    "  }",
    "}",
  ];

  const outputDir = path.resolve("src/adapters/crawlers");
  const outputPath = path.join(outputDir, `${className}.ts`);
  const files: string[] = [];

  if (fs.existsSync(outputPath)) {
    const backup = outputPath.replace(/\.ts$/, ".generated.ts");
    fs.writeFileSync(backup, lines.join("\n"), "utf-8");
    files.push(backup);
    files.push(`${outputPath} (已存在，请手动合并)`);
  } else {
    fs.writeFileSync(outputPath, lines.join("\n"), "utf-8");
    files.push(outputPath);
  }

  // fields.yaml
  const fieldsDir = path.resolve("output", siteName);
  if (!fs.existsSync(fieldsDir)) fs.mkdirSync(fieldsDir, { recursive: true });
  const yamlPath = path.join(fieldsDir, "fields.yaml");
  const yamlLines: string[] = [`# ${siteName} 字段清单 (由 scaffold 自动生成)`];
  for (const ep of endpoints.slice(0, 20)) {
    yamlLines.push(`\n  - endpoint: "${ep.path}"\n    method: ${ep.method}\n    params:`);
    if (ep.params.length > 0) for (const p of ep.params) yamlLines.push(`      - name: "${p}"\n        required: false`);
    else yamlLines.push("      # 无参数");
    yamlLines.push("    response_fields:\n      # TODO: 从全量数据中补充字段");
  }
  yamlLines.push("\nselected:\n  api_fields: []\n  page_fields: []");
  fs.writeFileSync(yamlPath, yamlLines.join("\n"), "utf-8");
  files.push(yamlPath);

  return files;
}

export function listHarvestFiles(): string[] {
  const outputDir = path.resolve("output");
  const files: string[] = [];
  if (!fs.existsSync(outputDir)) return files;
  for (const entry of fs.readdirSync(outputDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const dirPath = path.join(outputDir, entry.name);
      for (const f of fs.readdirSync(dirPath)) {
        if (f.endsWith(".json") && f.includes("harvest-")) files.push(path.join(dirPath, f));
      }
    }
  }
  return files;
}
