/**
 * 特化爬虫脚手架生成器。
 *
 * 从全量采集结果 (harvest-*.json) 中自动生成：
 *   a. XxxCrawler.ts 骨架（含端点定义、内容单元、fetchApi、兜底提取）
 *   b. fields.yaml（字段清单，供开发者勾选）
 *   c. 打印注册指引（ContentUnit.ts / CrawlerDispatcher / config.json）
 *
 * 用法:
 *   ts-node scripts/scaffold-special-crawler.ts <harvestFile> <siteName> [outputDir]
 *
 * 示例:
 *   ts-node scripts/scaffold-special-crawler.ts output/harvest-xxx.json boss_zhipin
 */
import fs from "fs";
import path from "path";

// ─── CLI ──────────────────────────────────────────────────────────────

const [, , harvestFile, siteName, outputDir = "src/adapters/crawlers"] = process.argv;

if (!harvestFile || !siteName) {
  console.error("用法: ts-node scripts/scaffold-special-crawler.ts <harvestFile> <siteName> [outputDir]");
  console.error("示例: ts-node scripts/scaffold-special-crawler.ts output/harvest-xxx.json boss_zhipin");
  process.exit(1);
}

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
  completedAt?: number;
}

interface HarvestResult {
  traceId: string;
  targetUrl: string;
  networkRequests: NetworkRequest[];
  elements: Array<{ tagName: string; selector: string; attributes: Record<string, string>; text?: string }>;
  storage: { localStorage: Record<string, string>; sessionStorage: Record<string, string>; cookies: Array<{ name: string; value: string; domain: string }> };
  jsVariables: Record<string, unknown>;
  startedAt: number;
  finishedAt: number;
}

interface EndpointInfo {
  name: string;
  path: string;
  method: string;
  params: string[];
  sampleResponse: unknown;
  count: number;
  isApi: boolean;
}

interface AntiCrawlInfo {
  category: string;
  severity: string;
  suggestion: string;
}

// ─── 工具函数 ──────────────────────────────────────────────────────────

const STATIC_EXT = new Set([".js", ".css", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".woff", ".woff2", ".ttf", ".eot", ".mp4", ".webm", ".webp", ".avif"]);

function isStaticAsset(url: string): boolean {
  try {
    const p = new URL(url).pathname;
    return STATIC_EXT.has(path.extname(p).toLowerCase());
  } catch { return false; }
}

function normalizePath(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname;
  } catch { return url; }
}

function inferEndpointName(pathStr: string, method: string): string {
  const segments = pathStr.replace(/\/wapi\/?/, "").replace(/\.json$/, "").split("/").filter(Boolean);
  if (segments.length === 0) return method === "GET" ? "index" : "action";
  const name = segments.map((s, i) =>
    i === segments.length - 1 ? s : s.replace(/^(zpgeek|zpcommon|zpuser|web|api|v\d+)/, ""),
  ).filter(Boolean).join("_") || segments[segments.length - 1];
  return name.replace(/[^a-zA-Z0-9_]/g, "_");
}

function extractParams(url: string): string[] {
  try {
    const u = new URL(url);
    return [...u.searchParams.keys()];
  } catch { return []; }
}

function inferParamType(key: string, _sampleValue: unknown): string {
  if (key.includes("id") || key.endsWith("Id") || key.endsWith("ID")) return "{id}";
  if (key === "page" || key === "size" || key === "limit" || key === "offset" || key === "num") return "{number}";
  if (key === "keyword" || key === "query" || key === "q" || key === "search") return "{keyword}";
  if (key === "city" || key === "cityCode" || key === "area") return "{city_code}";
  return `{${key}}`;
}

function extractFields(obj: unknown, prefix = ""): Array<{ path: string; type: string; example: unknown }> {
  const fields: Array<{ path: string; type: string; example: unknown }> = [];
  if (Array.isArray(obj)) {
    if (obj.length > 0) {
      fields.push({ path: prefix || "(root)", type: "array", example: `[${typeof obj[0]}]` });
      extractFields(obj[0], `${prefix}[]`).forEach((f) => fields.push(f));
    } else {
      fields.push({ path: prefix || "(root)", type: "array", example: "[]" });
    }
  } else if (obj !== null && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const fullPath = prefix ? `${prefix}.${k}` : k;
      if (Array.isArray(v)) {
        fields.push({ path: fullPath, type: "array", example: Array.isArray(v) ? `[${v.length} items]` : v });
        if (v.length > 0 && typeof v[0] === "object" && v[0] !== null) {
          extractFields(v[0], `${fullPath}[]`).forEach((f) => fields.push(f));
        }
      } else if (v !== null && typeof v === "object") {
        fields.push({ path: fullPath, type: typeof v, example: `{${Object.keys(v as object).slice(0, 3).join(",")}}` });
        extractFields(v, fullPath).forEach((f) => fields.push(f));
      } else {
        fields.push({ path: fullPath, type: typeof v, example: v });
      }
    }
  } else {
    fields.push({ path: prefix || "(root)", type: typeof obj, example: obj });
  }
  return fields;
}

function capitalizeSite(site: string): string {
  return site.split("_").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join("");
}

function siteToDomain(site: string): string {
  const map: Record<string, string> = {
    boss_zhipin: "zhipin.com",
    taobao: "taobao.com",
    jd: "jd.com",
    weibo: "weibo.com",
    douyin: "douyin.com",
    baidu: "baidu.com",
    pdd: "pinduoduo.com",
    meituan: "meituan.com",
  };
  return map[site] || `${site}.com`;
}

function siteToApiHost(site: string): string {
  const map: Record<string, string> = {
    boss_zhipin: "www.zhipin.com",
    taobao: "api.taobao.com",
    jd: "api.jd.com",
  };
  return map[site] || `www.${site}.com`;
}

function siteToCrawlerName(site: string): string {
  return site;
}

// ─── 反爬检测 ──────────────────────────────────────────────────────────

const ANTI_CRAWL_RULES: Array<{
  test: (req: NetworkRequest) => boolean;
  category: string;
  severity: string;
  suggestion: string;
}> = [
  {
    test: (req) => req.url.includes("w_rid=") && req.url.includes("wts="),
    category: "wbi_sign",
    severity: "high",
    suggestion: "B站 WBI 签名。需要从接口获取 img_key/sub_key，对参数排序后 MD5 签名生成 w_rid 和 wts。",
  },
  {
    test: (req) => req.url.toLowerCase().includes("x-s") || Object.keys(req.requestHeaders).some((h) => h.toLowerCase() === "x-s"),
    category: "xhs_x_s",
    severity: "high",
    suggestion: "小红书 X-s/X-t 签名。需实现 XXTEA+MD5+自定义 Base64 签名算法。参考 src/utils/crypto/xhs-signer.ts",
  },
  {
    test: (req) => req.url.includes("x-zse-96") || Object.keys(req.requestHeaders).some((h) => h.toLowerCase() === "x-zse-96"),
    category: "zhihu_x_zse_96",
    severity: "high",
    suggestion: "知乎 x-zse-96 签名。需对 URL 参数排序后拼接特定格式字符串，取 MD5 后 base64 编码。参考 src/utils/crypto/zhihu-signer.ts",
  },
  {
    test: (req) => req.url.includes("traceid") || Object.keys(req.requestHeaders).some((h) => h.toLowerCase() === "traceid"),
    category: "traceid",
    severity: "medium",
    suggestion: "请求头 traceid 用于请求追踪。需从首次页面加载响应头中提取并回传。",
  },
  {
    test: (req) => {
      const url = req.url.toLowerCase();
      const body = JSON.stringify(req.requestBody ?? "").toLowerCase();
      return (url.includes("captcha") || url.includes("geetest")) || (body.includes("captcha") || body.includes("geetest"));
    },
    category: "captcha",
    severity: "medium",
    suggestion: "检测到验证码。需对接打码平台或实现验证码识别。",
  },
  {
    test: (req) => req.url.includes("xsec_token") || req.url.includes("xsec_source"),
    category: "xhs_xsec_token",
    severity: "low",
    suggestion: "小红书 xsec_token。可从页面 __INITIAL_STATE__ 中提取后复用。",
  },
  {
    test: (req) => {
      const url = req.url.toLowerCase();
      return url.includes("__zp_stoken__");
    },
    category: "boss_stoken",
    severity: "high",
    suggestion: "BOSS 直聘 __zp_stoken__ 令牌。需通过 Playwright 浏览器自动获取和刷新。参考 src/utils/crypto/boss-zp-token.ts",
  },
  {
    test: (req) => Object.keys(req.requestHeaders).some((h) => h.toLowerCase() === "x-tt-*"),
    category: "tiktok_x_bogus",
    severity: "high",
    suggestion: "TikTok X-Bogus 签名。需运行 tiktok-signature 服务或实现 WebAssembly 签名。参考 src/utils/crypto/tiktok-signer.ts",
  },
  {
    test: (req) => {
      const body = JSON.stringify(req.requestBody ?? "");
      return body.includes("csrf") && !body.includes("csrf_token");
    },
    category: "anti_csrf",
    severity: "medium",
    suggestion: "CSRF 令牌。需从页面或 Cookie 中提取并动态更新。",
  },
];

function detectAntiCrawl(requests: NetworkRequest[]): AntiCrawlInfo[] {
  const items: AntiCrawlInfo[] = [];
  for (const req of requests) {
    for (const rule of ANTI_CRAWL_RULES) {
      if (rule.test(req)) {
        items.push({ category: rule.category, severity: rule.severity, suggestion: rule.suggestion });
      }
    }
  }
  const seen = new Set<string>();
  return items.filter((i) => {
    if (seen.has(i.category)) return false;
    seen.add(i.category);
    return true;
  });
}

// ─── 主流程 ────────────────────────────────────────────────────────────

function main(): void {
  // 1. 读取 harvest JSON
  const raw = fs.readFileSync(harvestFile, "utf-8");
  const harvest: HarvestResult = JSON.parse(raw);
  const requests = harvest.networkRequests || [];

  console.log(`\n📦 读取全量采集结果: ${harvestFile}`);
  console.log(`   目标URL: ${harvest.targetUrl}`);
  console.log(`   网络请求: ${requests.length} 条`);
  console.log(`   站点标识: ${siteName}\n`);

  // 2. 筛选 API 端点
  const apiRequests = requests.filter((r) => {
    if (isStaticAsset(r.url)) return false;
    if (r.resourceType === "document" || r.resourceType === "stylesheet" || r.resourceType === "font") return false;
    if (r.statusCode < 200 || r.statusCode >= 400) return false;
    return true;
  });

  // 3. 按路径分组
  const groups = new Map<string, EndpointInfo>();
  for (const req of apiRequests) {
    const p = normalizePath(req.url);
    if (!p || p === "/") continue;
    const existing = groups.get(p);
    if (existing) {
      existing.count++;
      if (!existing.sampleResponse && req.responseBody) existing.sampleResponse = req.responseBody;
      const params = extractParams(req.url);
      for (const param of params) {
        if (!existing.params.includes(param)) existing.params.push(param);
      }
    } else {
      const params = extractParams(req.url);
      groups.set(p, {
        name: inferEndpointName(p, req.method),
        path: p,
        method: req.method,
        params,
        sampleResponse: req.responseBody || undefined,
        count: 1,
        isApi: !!(req.responseBody && typeof req.responseBody === "object"),
      });
    }
  }

  const endpoints = [...groups.values()].sort((a, b) => b.count - a.count);
  console.log(`📊 发现 ${endpoints.length} 个 API 端点:\n`);
  for (const ep of endpoints.slice(0, 10)) {
    console.log(`   [${ep.method}] ${ep.path} (${ep.params.join(", ") || "无参数"}) — ${ep.count} 次请求`);
  }
  if (endpoints.length > 10) console.log(`   ... 还有 ${endpoints.length - 10} 个`);

  // 4. 检测反爬
  const antiCrawl = detectAntiCrawl(requests);
  console.log("\n🔒 反爬检测:");
  if (antiCrawl.length === 0) {
    console.log("   未检测到已知反爬特征");
  } else {
    for (const ac of antiCrawl) {
      console.log(`   [${ac.severity.toUpperCase()}] ${ac.category}`);
      console.log(`       建议: ${ac.suggestion}`);
    }
  }

  // 5. 生成 fields.yaml
  generateFieldsYaml(endpoints, harvest.elements);

  // 6. 生成 XxxCrawler.ts
  generateCrawlerFile(endpoints, antiCrawl, harvest.elements);

  // 7. 打印注册指引
  printRegistrationGuide();
}

// ─── 生成 fields.yaml ──────────────────────────────────────────────────

function generateFieldsYaml(endpoints: EndpointInfo[], _elements: HarvestResult["elements"]): void {
  const outputPath = path.join(outputDir, "..", "..", "..", "output", siteName, "fields.yaml").replace(/\\/g, "/");
  mkdirp(path.dirname(outputPath));

  const lines: string[] = [
    `# ${siteName} 字段清单`,
    "# 由 scaffold-special-crawler.ts 自动生成",
    "# 请在 selected 下勾选需要采集的字段",
    "",
    "api_fields:",
  ];

  for (const ep of endpoints.slice(0, 20)) {
    lines.push(`  - endpoint: "${ep.path}"`);
    lines.push(`    method: ${ep.method}`);
    lines.push("    params:");
    if (ep.params.length > 0) {
      for (const p of ep.params) {
        lines.push(`      - name: "${p}"`);
        lines.push("        type: string");
        lines.push("        required: false");
      }
    } else {
      lines.push("      # 无参数");
    }

    lines.push("    response_fields:");
    if (ep.sampleResponse) {
      const fields = extractFields(ep.sampleResponse);
      for (const f of fields.slice(0, 50)) {
        const ex = typeof f.example === "string" ? f.example.slice(0, 60) : JSON.stringify(f.example).slice(0, 60);
        lines.push(`      - name: "${f.path}"`);
        lines.push(`        type: ${f.type}`);
        lines.push(`        example: ${ex}`);
        lines.push("        selected: false  # ← 手动勾选");
      }
      if (fields.length > 50) {
        lines.push(`      # ... 还有 ${fields.length - 50} 个字段`);
      }
    } else {
      lines.push("      # 无响应样本数据");
    }
  }

  lines.push("");
  lines.push("page_fields:");
  lines.push("  # 以下字段来自页面 DOM 元素");
  if (_elements.length > 0) {
    for (const el of _elements.slice(0, 20)) {
      lines.push(`  - selector: "${el.selector}"`);
      lines.push(`    tag: ${el.tagName}`);
      lines.push(`    text_example: ${(el.text || "").slice(0, 80)}`);
      lines.push("    selected: false");
    }
  } else {
    lines.push("  # 无页面元素数据");
  }

  lines.push("");
  lines.push("selected:");
  lines.push("  api_fields: []  # 在此处列出要采集的字段路径");
  lines.push("  page_fields: []  # 在此处列出要采集的 CSS 选择器");

  fs.writeFileSync(outputPath, lines.join("\n"), "utf-8");
  console.log(`\n📄 字段清单已生成: ${outputPath}`);
}

// ─── 生成 XxxCrawler.ts ───────────────────────────────────────────────

function generateCrawlerFile(endpoints: EndpointInfo[], antiCrawl: AntiCrawlInfo[], _elements: HarvestResult["elements"]): void {
  const className = `${capitalizeSite(siteName)}Crawler`;
  const crawlerName = siteToCrawlerName(siteName);
  const domain = siteToDomain(siteName);
  const apiHost = siteToApiHost(siteName);
  const epConstName = `${capitalizeSite(siteName)}ApiEndpoints`;
  const siteNameUpper = siteName.toUpperCase().replace(/[^A-Z0-9_]/g, "_");

  // 生成端点定义代码
  const epLines: string[] = endpoints.slice(0, 30).map((ep) => {
    const paramsStr = ep.params.length > 0
      ? ep.params.map((p) => `${p}={${inferParamType(p, "")}}`).join("&")
      : "";
    const methodField = ep.method !== "GET" ? ", method: \"" + ep.method + "\"" : "";
    const pField = paramsStr ? ", params: \"" + paramsStr + "\"" : "";
    return "  { name: \"" + ep.name + "\", path: \"" + ep.path + "\"" + pField + methodField + " },";
  });

  // 生成签名方法建议
  const signatureLines: string[] = [];
  for (const ac of antiCrawl) {
    const refFiles: Record<string, string> = {
      xhs_x_s: "参考 src/utils/crypto/xhs-signer.ts",
      zhihu_x_zse_96: "参考 src/utils/crypto/zhihu-signer.ts",
      wbi_sign: "参考 src/utils/crypto/bilibili-signer.ts",
      boss_stoken: "参考 src/utils/crypto/boss-zp-token.ts（或者使用后端服务 backend/）",
      tiktok_x_bogus: "参考 src/utils/crypto/tiktok-signer.ts",
    };
    const ref = refFiles[ac.category] || "";
    signatureLines.push("    // [" + ac.severity.toUpperCase() + "] " + ac.category + ": " + ac.suggestion + (ref ? "\n    // " + ref : ""));
  }
  const _signatureTodo = signatureLines.length > 0 ? signatureLines.join("\n") + "\n" : "    // TODO: 注入签名头（如果站点需要）\n";

  // 生成 collectUnits cases
  const caseLines = endpoints.slice(0, 20).map((ep) => {
    const unitName = siteName + "_" + ep.name.replace(/\s+/g, "_").toLowerCase();
    return [
      "      case \"" + unitName + "\": {",
      "        const r = await this.fetchApi(\"" + ep.name + "\", {}, session);",
      "        const d = JSON.parse(r.body);",
      "        results.push({ unit, status: d.code === 0 ? \"success\" : \"failed\", data: d, method: \"signature\", responseTime: r.responseTime });",
      "        break;",
      "      }",
    ].join("\n");
  }).join("\n");

  // Build file line by line to avoid template literal escaping issues
  const lines: string[] = [];

  lines.push("import { CrawlerSession, PageData } from \"../../core/ports/ISiteCrawler\";");
  lines.push("import { IProxyProvider } from \"../../core/ports/IProxyProvider\";");
  lines.push("import { UnitResult } from \"../../core/models/ContentUnit\";");
  lines.push("import { getRateLimiter } from \"../../utils/rate-limiter\";");
  lines.push("import { BaseCrawler } from \"./BaseCrawler\";");
  lines.push("import { RateLimitMiddleware } from \"./middleware/RateLimitMiddleware\";");
  lines.push("import { BodyTruncationMiddleware } from \"./middleware/BodyTruncationMiddleware\";");
  lines.push("");
  lines.push("const " + siteNameUpper + "_DOMAIN = \"" + domain + "\";");
  lines.push("const " + siteNameUpper + "_API_HOST = \"" + apiHost + "\";");
  lines.push("");
  lines.push("// --- API 端点定义 ---");
  lines.push("");
  lines.push("export interface " + capitalizeSite(siteName) + "EndpointDef {");
  lines.push("  name: string;");
  lines.push("  path: string;");
  lines.push("  method?: string;");
  lines.push("  params?: string;");
  lines.push("  status?: \"verified\" | \"sig_pending\";");
  lines.push("}");
  lines.push("");
  lines.push("export const " + epConstName + ": ReadonlyArray<" + capitalizeSite(siteName) + "EndpointDef> = [");
  if (epLines.length > 0) {
    for (const l of epLines) lines.push(l);
  } else {
    lines.push("  // TODO: 从全量采集结果中添加端点");
  }
  lines.push("];");
  lines.push("");
  lines.push("// --- 爬虫实现 ---");
  lines.push("");
  lines.push("export class " + className + " extends BaseCrawler {");
  lines.push("  readonly name = \"" + crawlerName + "\";");
  lines.push("  readonly domain = " + siteNameUpper + "_DOMAIN;");
  lines.push("");
  lines.push("  constructor(proxyProvider?: IProxyProvider) {");
  lines.push("    super(\"" + crawlerName + "\", proxyProvider);");
  lines.push("    this.rateLimiter = getRateLimiter(\"" + crawlerName + "\", {");
  lines.push("      enabled: true,");
  lines.push("      minDelay: 1500,");
  lines.push("      maxDelay: 4000,");
  lines.push("      cooldownMinutes: 15,");
  lines.push("      maxConcurrentSignatures: 1,");
  lines.push("      maxConcurrentPages: 1,");
  lines.push("    });");
  lines.push("    this.build" + capitalizeSite(siteName) + "Pipeline();");
  lines.push("  }");
  lines.push("");
  lines.push("  private build" + capitalizeSite(siteName) + "Pipeline(): void {");
  lines.push("    this.pipeline.clear();");
  lines.push("    // TODO: 注册站点特定的安全/签名中间件");
  lines.push("    this.pipeline.use(new RateLimitMiddleware(this.rateLimiter));");
  lines.push("    this.pipeline.use(new BodyTruncationMiddleware(200000));");
  lines.push("  }");
  lines.push("");
  lines.push("  matches(url: string): boolean {");
  lines.push("    try {");
  lines.push("      return new URL(url).hostname.includes(" + siteNameUpper + "_DOMAIN);");
  lines.push("    } catch {");
  lines.push("      return false;");
  lines.push("    }");
  lines.push("  }");
  lines.push("");
  lines.push("  protected getReferer(_url: string): string {");
  lines.push("    return \"https://www." + domain + "/\";");
  lines.push("  }");
  lines.push("");
  lines.push("  protected addAuthHeaders(headers: Record<string, string>, _url: string, _method: string, _body: string, _session?: CrawlerSession): void {");
  lines.push("    headers[\"x-requested-with\"] = \"XMLHttpRequest\";");
  lines.push("    headers[\"Origin\"] = \"https://www." + domain + "\";");
  lines.push("    headers[\"Referer\"] = \"https://www." + domain + "/\";");
  lines.push("    headers[\"Accept\"] = \"application/json, text/plain, */*\";");
  if (signatureLines.length > 0) {
    for (const s of signatureLines) lines.push(s);
  } else {
    lines.push("    // TODO: 注入签名头（如果站点需要）");
  }
  lines.push("  }");
  lines.push("");
  lines.push("  // --- API 端点采集 ---");
  lines.push("");
  lines.push("  async fetchApi(");
  lines.push("    endpointName: string,");
  lines.push("    params?: Record<string, string>,");
  lines.push("    session?: CrawlerSession,");
  lines.push("  ): Promise<PageData> {");
  lines.push("    const ep = " + epConstName + ".find((e) => e.name === endpointName);");
  lines.push("    if (!ep) throw new Error(\"未知端点: \" + endpointName);");
  lines.push("    let query = ep.params || \"\";");
  lines.push("    if (params) {");
  lines.push("      for (const [k, v] of Object.entries(params)) {");
  lines.push("        query = query.replace(\"{\" + k + \"}\", encodeURIComponent(v));");
  lines.push("      }");
  lines.push("    }");
  lines.push("    const url = \"https://\" + " + siteNameUpper + "_API_HOST + ep.path + (query ? \"?\" + query : \"\");");
  lines.push("    return this.fetchWithRetry(url, session);");
  lines.push("  }");
  lines.push("");
  lines.push("  // --- 页面兜底提取 ---");
  lines.push("");
  lines.push("  async fetchPageData(pageType: string, _params: Record<string, string>, session?: CrawlerSession): Promise<PageData> {");
  lines.push("    const pageUrl = \"https://www." + domain + "/\";");
  lines.push("    const { browser, startTime } = await this.fetchPageContent(pageUrl, session, \"." + domain + "\");");
  lines.push("    try {");
  lines.push("      await new Promise((r) => setTimeout(r, 2000));");
  lines.push("      const title = await browser.executeScript<string>(\"document.title\").catch(() => \"\");");
  lines.push("      const bodyText = await browser.executeScript<string>(\"document.body.innerText.slice(0, 5000)\").catch(() => \"\");");
  lines.push("      return {");
  lines.push("        url: pageUrl,");
  lines.push("        statusCode: 200,");
  lines.push("        body: JSON.stringify({ title, content: bodyText }),");
  lines.push("        headers: { \"content-type\": \"application/json;charset=utf-8\" },");
  lines.push("        responseTime: Date.now() - startTime,");
  lines.push("        capturedAt: new Date().toISOString(),");
  lines.push("      };");
  lines.push("    } finally {");
  lines.push("      await browser.close();");
  lines.push("    }");
  lines.push("  }");
  lines.push("");
  lines.push("  // --- 内容单元采集 ---");
  lines.push("");
  lines.push("  async collectUnits(");
  lines.push("    units: string[],");
  lines.push("    params: Record<string, string>,");
  lines.push("    session?: CrawlerSession,");
  lines.push("    _authMode?: string,");
  lines.push("  ): Promise<UnitResult<unknown>[]> {");
  lines.push("    const results: UnitResult[] = [];");
  lines.push("    for (const unit of units) {");
  lines.push("      const start = Date.now();");
  lines.push("      try {");
  lines.push("        switch (unit) {");
  if (caseLines) lines.push(caseLines);
  lines.push("          default:");
  lines.push("            results.push({ unit, status: \"failed\", data: null, method: \"none\", error: \"\u672A\u77E5\u5355\u5143: \" + unit, responseTime: 0 });");
  lines.push("        }");
  lines.push("      } catch (e: unknown) {");
  lines.push("        results.push({ unit, status: \"failed\", data: null, method: \"none\", error: e instanceof Error ? e.message : String(e), responseTime: Date.now() - start });");
  lines.push("      }");
  lines.push("    }");
  lines.push("    return results;");
  lines.push("  }");
  lines.push("}");

  const template = lines.join("\n");

  const outputPath = path.resolve(outputDir, `${className}.ts`);
  if (fs.existsSync(outputPath)) {
    const backupPath = outputPath.replace(/\.ts$/, ".generated.ts");
    fs.writeFileSync(backupPath, template.trimStart(), "utf-8");
    console.log(`\n⚠️  ${outputPath} 已存在，已保存到: ${backupPath}`);
    console.log("   请手动合并到原有文件");
  } else {
    mkdirp(path.dirname(outputPath));
    fs.writeFileSync(outputPath, template.trimStart(), "utf-8");
    console.log(`\n📄 爬虫骨架已生成: ${outputPath}`);
  }
}

// ─── 注册指引 ──────────────────────────────────────────────────────────

function printRegistrationGuide(): void {
  const className = `${capitalizeSite(siteName)}Crawler`;
  const crawlerName = siteToCrawlerName(siteName);
  const _contentUnitPrefix = siteName.toUpperCase().replace(/[^A-Z0-9_]/g, "_");

  console.log("\n📋 注册指引 (手动操作):");
  console.log("\n1. 在 src/core/models/ContentUnit.ts 中添加内容单元类型:");
  console.log("```typescript");
  console.log(`/** ${siteName} 内容单元类型。 */`);
  console.log(`export type ${capitalizeSite(siteName)}ContentUnit =`);
  for (const unit of [`${crawlerName}_page`, `${crawlerName}_search`, `${crawlerName}_detail`]) {
    console.log(`  | "${unit}"`);
  }
  console.log(";");
  console.log("```");

  console.log("\n2. 在 src/adapters/crawlers/middleware/index.ts 中导出中间件（如果需要）");
  console.log("```typescript");
  console.log(`export { ${className}Middleware } from "./${capitalizeSite(siteName)}Middleware";`);
  console.log("```");

  console.log("\n3. 在 src/index.ts 中注册爬虫:");
  console.log("```typescript");
  console.log(`import { ${className} } from "./adapters/crawlers/${className}";`);
  console.log("// 在 createCrawlerDispatcher 函数中:");
  console.log(`if (appCfg.crawlers?.${crawlerName} === "enabled") d.register(new ${className}(globalProxyProvider));`);
  console.log("```");

  console.log("\n4. 在 config.json 中启用爬虫:");
  console.log("```json");
  console.log("\"crawlers\": {");
  console.log(`  "${crawlerName}": "enabled"`);
  console.log("}");
  console.log("```");

  console.log("\n5. TODO 清单:");
  console.log(`   ☐ 在 ${className}.ts 中实现签名逻辑 (addAuthHeaders)`);
  console.log("   ☐ 验证端点是否返回 code=0");
  console.log("   ☐ 在 fields.yaml 中勾选需要采集的字段");
  console.log("   ☐ 编写 collectUnits 中各单元的解析逻辑");
  console.log("   ☐ 运行 npm test 验证无回归");
  console.log("");
}

// ─── 工具 ──────────────────────────────────────────────────────────────

function mkdirp(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ─── 执行 ──────────────────────────────────────────────────────────────

main();
