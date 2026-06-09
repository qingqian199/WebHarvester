import { execFile } from "child_process";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import type { ILogger } from "../core/ports/ILogger";
import { ConsoleLogger } from "../adapters/ConsoleLogger";
import type {
  HttpExchange,
  CaptureAnalysisReport,
  CaptureFileType,
  CaptureIntegrationConfig,
  SuggestedUnit,
  SigningClue,
} from "../types/capture.types";

const SIGN_PARAM_PATTERNS = [
  /^sign/i,
  /^sig(nature)?$/i,
  /^token$/i,
  /^bogus$/i,
  /^x-bogus$/i,
  /^_sign$/i,
  /^sig$/i,
  /^auth$/i,
  /^nonce$/i,
  /^ts$/i,
  /^_t$/i,
  /^w_rid$/i,
  /^wts$/i,
  /^ds$/i,
  /^device_fp$/i,
  /^x-rpc-device_fp$/i,
];

const DEFAULT_CONFIG: Required<CaptureIntegrationConfig> = { tsharkPath: "tshark", mitmproxyPath: "mitmproxy", defaultImportDir: "" };

export class CaptureIntegrationService {
  private logger: ILogger;
  private config: Required<CaptureIntegrationConfig>;

  constructor(config?: CaptureIntegrationConfig, logger?: ILogger) {
    this.logger = logger ?? new ConsoleLogger("info");
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async importMitmDump(filePath: string): Promise<HttpExchange[]> {
    const raw = await fs.readFile(filePath, "utf-8");
    const data = JSON.parse(raw);
    const exchanges: HttpExchange[] = [];
    if (data.log?.entries) {
      for (const entry of data.log.entries) exchanges.push(this.harEntryToExchange(entry));
      this.logger.info(`✅ 从 HAR 导入 ${exchanges.length} 条记录`);
      return exchanges;
    }
    if (Array.isArray(data)) {
      for (const item of data) {
        if (item.request && item.response) exchanges.push(this.mitmRawToExchange(item));
      }
      this.logger.info(`✅ 从 mitmproxy JSON 导入 ${exchanges.length} 条记录`);
      return exchanges;
    }
    throw new Error("无法识别的文件格式：缺少 log.entries 或 request/response 字段");
  }

  async importPcap(filePath: string, filter?: string): Promise<HttpExchange[]> {
    await fs.access(filePath);
    const args = ["-r", filePath, "-T", "json"];
    if (filter) args.push("-Y", filter);
    else args.push("-Y", "http");
    const stdout = await this.execTshark(this.config.tsharkPath, args);
    return this.packetsToExchanges(JSON.parse(stdout));
  }

  analyzeAndSuggest(exchanges: HttpExchange[], domain: string): CaptureAnalysisReport {
    const pathGroups = new Map<string, { count: number; methods: Set<string>; samples: HttpExchange[] }>();
    for (const ex of exchanges) {
      try {
        const u = new URL(ex.url);
        if (!u.hostname.includes(domain) && !domain.includes(u.hostname)) continue;
        const p = u.pathname;
        if (!pathGroups.has(p)) pathGroups.set(p, { count: 0, methods: new Set(), samples: [] });
        const g = pathGroups.get(p)!;
        g.count++;
        g.methods.add(ex.method);
        g.samples.push(ex);
      } catch {
        this.logger.debug("跳过无法解析 URL 的请求");
      }
    }
    const pathFrequency = Array.from(pathGroups.entries())
      .map(([path, g]) => ({ path, count: g.count, methods: Array.from(g.methods) }))
      .sort((a, b) => b.count - a.count);
    const signParamCandidates = new Map<string, string[]>();
    for (const ex of exchanges) {
      try {
        const u = new URL(ex.url);
        for (const [k] of u.searchParams) {
          if (SIGN_PARAM_PATTERNS.some((p) => p.test(k))) {
            if (!signParamCandidates.has(k)) signParamCandidates.set(k, []);
            signParamCandidates.get(k)!.push(ex.url);
          }
        }
        for (const h of Object.keys(ex.requestHeaders)) {
          if (SIGN_PARAM_PATTERNS.some((p) => p.test(h))) {
            if (!signParamCandidates.has(h)) signParamCandidates.set(h, []);
            signParamCandidates.get(h)!.push(ex.url);
          }
        }
        for (const h of Object.keys(ex.requestHeaders)) {
          if (SIGN_PARAM_PATTERNS.some((p) => p.test(h))) {
            if (!signParamCandidates.has(h)) signParamCandidates.set(h, []);
            signParamCandidates.get(h)!.push(ex.url);
          }
        }
      } catch {
        this.logger.debug("跳过签名参数检测中无法解析的请求");
      }
    }
    const suggestedUnits: SuggestedUnit[] = [];
    for (const [p, g] of pathGroups) {
      const sample = g.samples[0];
      const urlParams = sample ? Array.from(new URL(sample.url).searchParams.keys()) : [];
      suggestedUnits.push({
        name: p.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase(),
        url: sample?.url ?? "",
        method: Array.from(g.methods).join(","),
        params: urlParams,
        paramMap: {},
      });
    }
    return {
      totalRequests: exchanges.filter((e) => {
        try {
          return new URL(e.url).hostname.includes(domain);
        } catch {
          return false;
        }
      }).length,
      domain,
      suggestedUnits,
      potentialSignParams: Array.from(signParamCandidates.keys()),
      pathFrequency,
    };
  }

  async generateSigningClue(exchanges: HttpExchange[]): Promise<SigningClue[]> {
    const paramValues = new Map<string, Set<string>>();
    const paramUrls = new Map<string, Set<string>>();
    for (const ex of exchanges) {
      try {
        const u = new URL(ex.url);
        for (const [k, v] of u.searchParams) {
          if (!SIGN_PARAM_PATTERNS.some((p) => p.test(k))) continue;
          if (!paramValues.has(k)) paramValues.set(k, new Set());
          if (!paramUrls.has(k)) paramUrls.set(k, new Set());
          paramValues.get(k)!.add(v);
          paramUrls.get(k)!.add(ex.url);
        }
        for (const [h, v] of Object.entries(ex.requestHeaders)) {
          if (!SIGN_PARAM_PATTERNS.some((p) => p.test(h))) continue;
          if (!paramValues.has(h)) paramValues.set(h, new Set());
          if (!paramUrls.has(h)) paramUrls.set(h, new Set());
          paramValues.get(h)!.add(v);
          paramUrls.get(h)!.add(ex.url);
        }
      } catch {
        this.logger.debug("生成签名线索时跳过异常请求");
      }
    }
    return Array.from(paramValues.entries()).map(([param, values]) => ({
      paramName: param,
      sampleValue: Array.from(values)[0]?.slice(0, 80) || "",
      appearsIn: Array.from(paramUrls.get(param) || []).slice(0, 5),
      notes: param.match(/^(wts|_t|ts|timestamp)$/i)
        ? "可能是时间戳参数"
        : param.match(/^(w_rid|md5|hash|_sign)$/i)
          ? "可能是 MD5/哈希摘要"
          : "观察值是否随请求参数变化",
    }));
  }

  async analyzeFile(filePath: string, type: CaptureFileType, domain?: string): Promise<{ report: CaptureAnalysisReport; clues: SigningClue[] }> {
    const resolved = path.resolve(filePath);
    const exchanges = type === "mitm" ? await this.importMitmDump(resolved) : await this.importPcap(resolved);
    const resolvedDomain = domain || this.extractDomain(exchanges);
    const report = this.analyzeAndSuggest(exchanges, resolvedDomain);
    const clues = await this.generateSigningClue(exchanges);
    return { report, clues };
  }

  private harEntryToExchange(entry: any): HttpExchange {
    return {
      id: crypto.randomUUID(),
      url: entry.request?.url || "",
      method: entry.request?.method || "GET",
      requestHeaders: this.flattenHeaders(entry.request?.headers),
      requestBody: entry.request?.postData?.text || undefined,
      responseStatus: entry.response?.status || 0,
      responseHeaders: this.flattenHeaders(entry.response?.headers),
      responseBody: entry.response?.content?.text || undefined,
      timestamp: entry.startedDateTime ? new Date(entry.startedDateTime).getTime() : Date.now(),
    };
  }
  private mitmRawToExchange(item: any): HttpExchange {
    return {
      id: crypto.randomUUID(),
      url: item.request?.url || "",
      method: item.request?.method || "GET",
      requestHeaders: this.flattenHeaders(item.request?.headers),
      requestBody: item.request?.content || undefined,
      responseStatus: item.response?.status_code || 0,
      responseHeaders: this.flattenHeaders(item.response?.headers),
      responseBody: item.response?.content || undefined,
      timestamp: Date.now(),
    };
  }
  private flattenHeaders(headers: any): Record<string, string> {
    if (!headers) return {};
    if (Array.isArray(headers)) {
      const out: Record<string, string> = {};
      for (const h of headers) {
        if (h.name && h.value) out[h.name] = h.value;
      }
      return out;
    }
    if (typeof headers === "object") return { ...headers };
    return {};
  }
  private execTshark(tshark: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      // eslint-disable-next-line no-magic-numbers
      execFile(tshark, args, { maxBuffer: 100 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) {
          if (stdout) resolve(stdout);
          else reject(new Error(`tshark 执行失败: ${err.message}\n${stderr}`));
          return;
        }
        resolve(stdout);
      });
    });
  }
  private packetsToExchanges(packets: any[]): HttpExchange[] {
    const partials = new Map<string, Partial<HttpExchange>>();
    for (const pkt of packets) {
      const layers = pkt._source?.layers;
      if (!layers) continue;
      const httpReq = layers.http?.request;
      const httpResp = layers.http?.response;
      if (!httpReq && !httpResp) continue;
      const frameNum = String(layers.frame?.frame_number || "");
      if (!frameNum) continue;
      if (!partials.has(frameNum)) partials.set(frameNum, { id: crypto.randomUUID(), timestamp: Date.now() });
      const entry = partials.get(frameNum)!;
      if (httpReq) {
        entry.url = httpReq.http_request_full_uri || `https://${httpReq.http_host}${httpReq.http_request_uri || "/"}`;
        entry.method = httpReq.http_request_method || "GET";
      }
      if (httpResp) {
        entry.responseStatus = parseInt(httpResp.http_response_code || "0", 10);
      }
    }
    return Array.from(partials.values()).filter((e) => e.url) as HttpExchange[];
  }
  private extractDomain(exchanges: HttpExchange[]): string {
    const counts = new Map<string, number>();
    for (const ex of exchanges) {
      try {
        const host = new URL(ex.url).hostname;
        counts.set(host, (counts.get(host) || 0) + 1);
      } catch {
        this.logger.debug("提取域名时跳过无效 URL");
      }
    }
    let topDomain = "",
      topCount = 0;
    for (const [d, c] of counts) {
      if (c > topCount) {
        topDomain = d;
        topCount = c;
      }
    }
    return topDomain;
  }
}
