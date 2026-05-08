import { CrawlerSession } from "../../core/ports/ISiteCrawler";
import { IProxyProvider } from "../../core/ports/IProxyProvider";
import { UnitResult } from "../../core/models/ContentUnit";
import { BaseCrawler } from "./BaseCrawler";
import { PlaywrightAdapter } from "../PlaywrightAdapter";

const SCHOLAR_DOMAIN = "xueshu.baidu.com";

/** 从搜索 API 的 paperList 中提取纸面字段。 */
function extractPaperBasic(p: any): Record<string, any> {
  const authors = (p.authors || []).map((a: any) => a.showName || a.name || "").filter(Boolean);
  const authorAffs = (p.authors || []).map((a: any) => a.affiliate || "").filter(Boolean);
  const sources = (p.sourceList || []).map((s: any) => ({ url: s.url || "", name: s.anchor || "", domain: s.domain || "" }));
  // 尝试从 DOI 提取卷期页码: CNKI:SUN:JOURNAL.YEAR-ISSUE-PAGE
  let vol = "", issue = "", pages = "";
  const doi = p.doi || "";
  if (doi.startsWith("CNKI:SUN:")) {
    const parts = doi.split(".");
    if (parts.length >= 3) {
      const yearIssue = parts[1] || "";
      pages = parts.length >= 4 ? parts[parts.length - 1] : "";
      if (yearIssue.includes("-")) {
        vol = yearIssue.split("-")[0] || "";
        issue = yearIssue.split("-")[1] || "";
      }
    }
  }
  return {
    序号: 0,
    标题: (p.title || "").replace(/<\/?em>/g, ""),
    作者: authors.join("; "),
    作者单位: authorAffs.join("; "),
    发表年份: p.publishYear || "",
    期刊会议: p.publishInfo?.journalName || p.publishInfo?.publisher || "",
    卷: vol,
    期: issue,
    页码: pages,
    摘要: (p.abstract || "").replace(/<\/?em>/g, "").replace(/<\/?b>/g, ""),
    关键词: (p.keyword || "").replace(/<\/?em>/g, ""),
    DOI: doi,
    被引次数: p.cited ?? 0,
    下载量: "",
    基金项目: "",
    参考文献: "",
    作者邮箱: "",
    导师信息: "",
    论文分类号: "",
    原文链接: sources.map((s: any) => s.url).join("\n"),
    来源名称: sources.map((s: any) => s.name).join("; "),
    备注: "",
    _paperId: p.paperId || "",
  };
}

/** 从 detail 页检查是否有 CAPTCHA */
async function checkCaptcha(browser: PlaywrightAdapter): Promise<boolean> {
  try {
    const title = await browser.executeScript<string>("document.title").catch(() => "") as unknown as string;
    return title.includes("百度安全验证") || title.includes("安全验证");
  } catch { return false; }
}

export class BaiduScholarCrawler extends BaseCrawler {
  readonly name = "xueshu";
  readonly domain = SCHOLAR_DOMAIN;

  constructor(proxyProvider?: IProxyProvider) { super("xueshu", proxyProvider); this.registerHandlers(); }

  matches(url: string): boolean {
    try { return new URL(url).hostname.includes(SCHOLAR_DOMAIN); } catch { return false; }
  }

  protected getReferer(_url: string): string { return "https://xueshu.baidu.com/"; }

  private registerHandlers(): void {
    // ── 搜索论文（HTTP 直连，快速翻页） ──
    this.unitHandlers.set("scholar_search", async (unit, params, _session) => {
      const keyword = params.keyword || params.wd || "";
      if (!keyword) return { unit, status: "failed", data: null, method: "none", error: "缺少 keyword", responseTime: 0 };

      const maxPages = Math.min(parseInt(params.max_pages || "5"), 50);
      const allPapers: Record<string, any>[] = [];
      let totalTime = 0;

      for (let page = 0; page < maxPages; page++) {
        const pn = page * 10;
        try {
          const url = `https://xueshu.baidu.com/search/api/search?wd=${encodeURIComponent(keyword)}&pn=${pn}&skipStrategy=0`;
          const result = await this.fetch(url, _session);
          totalTime += result.responseTime;
          const body = JSON.parse(result.body);
          if (body.status?.code !== 0) break;
          const list = body.data?.paper?.paperList || [];
          if (list.length === 0) break;
          for (const p of list) {
            allPapers.push({ ...extractPaperBasic(p), _paperId: p.paperId || "" });
          }
          if (page % 5 === 4 || page === 0) {
            this.logger.info(`  搜索第 ${page + 1} 页: 累计 ${allPapers.length} 篇`);
          }
        } catch (e: any) {
          this.logger.warn(`搜索第 ${page + 1} 页失败: ${e.message}`);
          break;
        }
      }

      return {
        unit, status: "success",
        data: { code: 0, data: { papers: allPapers, total: allPapers.length } },
        method: "api", responseTime: totalTime,
      };
    });

    // ── 论文详情（浏览器提取：API + SSR + inline script + JSON-LD + DOM） ──
    this.unitHandlers.set("scholar_paper_detail", async (unit, params, session) => {
      const resultsKey = params.__results__ as unknown as UnitResult[] | undefined;
      const searchResult = resultsKey?.find((r) => r.unit === "scholar_search" && r.status === "success");
      let papers: Record<string, any>[] = [];

      if (params.paper_id) {
        papers = [{ _paperId: params.paper_id }];
      } else if (searchResult) {
        papers = (searchResult.data as any)?.data?.papers || [];
      }

      if (papers.length === 0) {
        return { unit, status: "failed", data: null, method: "none", error: "自动获取详情需要先采集「搜索论文」或提供 paper_id", responseTime: 0 };
      }

      const maxDetails = Math.min(parseInt(params.max_details || "10"), 50);
      const targets = papers.slice(0, maxDetails);
      const enriched: Record<string, any>[] = [];
      const startTime = Date.now();
      let cdpAttempted = false;
      let usedCDP = false;

      for (let i = 0; i < targets.length; i++) {
        const pid = targets[i]._paperId || targets[i].paperId || "";
        if (!pid) continue;

        let browser: PlaywrightAdapter | null = null;
        let isCDP = false;

        try {
          // ── 获取浏览器实例（CDP 优先） ──
          if (!cdpAttempted) {
            try {
              const { getBrowser: getProviderBrowser } = await import("../../services/BrowserProvider");
              const inst = await getProviderBrowser("__cdp__", true);
              if (inst.isCDP && inst.context) {
                const adapter = new PlaywrightAdapter(this.logger);
                // 设置 API 响应拦截器（在页面加载前注册，但需要先有 page）
                const rawCtx = inst.context;
                const rawPage = await rawCtx.newPage();
                const apiResponses: Record<string, any>[] = [];
                rawPage.on("response", async (res: any) => {
                  const url = res.url();
                  if (url.includes("/api/") || url.includes("/data/")) {
                    try {
                      const text = await res.text();
                      if (text.startsWith("{") && (text.includes("paperId") || text.includes("title") || text.length > 500)) {
                        apiResponses.push({ url: url.split("?")[0], data: JSON.parse(text) });
                      }
                    } catch {}
                  }
                });
                await rawPage.goto(`https://xueshu.baidu.com/usercenter/paper/show?paperid=${pid}`, { waitUntil: "domcontentloaded", timeout: 20000 });
                await new Promise((r) => setTimeout(r, 3000));
                // 注入 page 到 LCM
                const lcm = (adapter as any).lcm;
                lcm.page = rawPage;
                lcm.context = rawCtx;
                lcm.pooled = true;
                browser = adapter;
                isCDP = true;
                usedCDP = true;
                cdpAttempted = true;
                this.logger.info(`  详情 ${i + 1}/${targets.length}: 使用 CDP`);

                // 策略 A: 从拦截的 API 响应中提取
                let detailFound = false;
                for (const ar of apiResponses) {
                  const detail = tryExtractPaperDetailFromAny(ar.data);
                  if (detail) {
                    enriched.push({ ...targets[i], ...detail, _detailStatus: "ok", _detailSource: `api:${ar.url}` });
                    this.logger.info(`  详情 ${i + 1}/${targets.length}: ${(targets[i].标题 || pid).slice(0, 30)} (API: ${ar.url.slice(0, 60)})`);
                    detailFound = true;
                    break;
                  }
                }
                if (detailFound) continue;
              }
            } catch (e: any) {
              this.logger.warn(`  CDP 连接失败: ${e.message}, 回退到 headless`);
            }
          }

          // ── CDP 不可用 → headless ──
          if (!browser) {
            const result = await this.fetchPageContent(
              `https://xueshu.baidu.com/usercenter/paper/show?paperid=${pid}`,
              session, ".xueshu.baidu.com"
            );
            browser = result.browser;
          }

          // ── 策略 B: 检查 CAPTCHA ──
          const isCaptcha = await checkCaptcha(browser!);
          if (isCaptcha) {
            this.logger.warn(`  详情 ${i + 1}/${targets.length} ${pid.slice(0, 16)}: 百度安全验证拦截`);
            enriched.push({ ...targets[i], _detailStatus: "captcha" });
            continue;
          }

          // ── 策略 F: SSR 数据提取（__INITIAL_STATE__ / __NEXT_DATA__ / __NUXT_DATA__） ──
          const ssrResult = await this.extractSSRData(browser!, "scholar_paper_detail");
          if (ssrResult.body) {
            let ssrParsed: any;
            try { ssrParsed = JSON.parse(ssrResult.body); } catch {}
            if (ssrParsed && (ssrParsed._hasInitState || ssrParsed._hasNextData || ssrParsed._hasNuxtData)) {
              const dataSource = ssrParsed.data || ssrParsed.nextData?.props?.pageProps || ssrParsed.nuxtData;
              const detail = tryExtractPaperDetailFromAny(dataSource || ssrParsed);
              if (detail) {
                enriched.push({ ...targets[i], ...detail, _detailStatus: "ok", _detailSource: "ssr" });
                this.logger.info(`  详情 ${i + 1}/${targets.length}: ${(targets[i].标题 || pid).slice(0, 30)} (SSR)`);
                continue;
              }
            }
          }

          // ── 策略 C: 扫描所有 inline script 标签 ──
          const scriptData = await scanAllScriptsForPaperData(browser!);
          if (scriptData && scriptData.paperId) {
            const detail = tryExtractPaperDetailFromAny(scriptData);
            enriched.push({ ...targets[i], ...(detail || {}), _detailStatus: "ok", _detailSource: "inline_script" });
            this.logger.info(`  详情 ${i + 1}/${targets.length}: ${(targets[i].标题 || pid).slice(0, 30)} (inline script)`);
            continue;
          }

          // ── 策略 D: JSON-LD ──
          const jsonld = await checkJSONLD(browser!);
          if (jsonld && (jsonld.name || jsonld.description)) {
            const mapped: Record<string, string> = {};
            if (jsonld.name) mapped.标题 = jsonld.name;
            if (jsonld.description) mapped.摘要 = jsonld.description;
            if (jsonld.datePublished) mapped.发表年份 = jsonld.datePublished.slice(0, 4);
            if (jsonld.author) mapped.作者 = Array.isArray(jsonld.author) ? jsonld.author.map((a: any) => a.name || "").filter(Boolean).join("; ") : jsonld.author.name || "";
            enriched.push({ ...targets[i], ...mapped, _detailStatus: "partial", _detailSource: "jsonld" });
            this.logger.info(`  详情 ${i + 1}/${targets.length}: ${(targets[i].标题 || pid).slice(0, 30)} (JSON-LD)`);
            continue;
          }

          // ── 策略 E: DOM 文本提取 ──
          const domDetail = await extractDOMDetail(browser!);
          if (domDetail && Object.keys(domDetail).length > 0) {
            enriched.push({ ...targets[i], ...domDetail, _detailStatus: domDetail._hasRealData ? "ok" : "partial", _detailSource: "dom" });
            this.logger.info(`  详情 ${i + 1}/${targets.length}: ${(targets[i].标题 || pid).slice(0, 30)} (DOM)`);
            continue;
          }

          // ── 所有策略失败 ──
          this.logger.warn(`  详情 ${i + 1}/${targets.length} ${pid.slice(0, 16)}: 页面无可用数据`);
          enriched.push({ ...targets[i], _detailStatus: "no_data" });

        } catch (e: any) {
          this.logger.warn(`  详情 ${i + 1}/${targets.length} ${pid.slice(0, 16)}: ${e.message}`);
          enriched.push({ ...targets[i], _detailStatus: "error", _detailError: e.message });
        } finally {
          if (browser) {
            if (isCDP) {
              try { const p = (browser as any).lcm?.page; if (p) await p.close().catch(() => {}); } catch {}
            } else {
              await (browser as any).close().catch(() => {});
            }
          }
        }
      }

      const okCount = enriched.filter((p) => p._detailStatus === "ok").length;
      const partialCount = enriched.filter((p) => p._detailStatus === "partial").length;
      const captchaCount = enriched.filter((p) => p._detailStatus === "captcha").length;
      const noDataCount = enriched.filter((p) => p._detailStatus === "no_data").length;
      this.logger.info(`✅ 论文详情完成: ${okCount}/${targets.length} 篇成功${partialCount > 0 ? `, ${partialCount} 篇部分` : ""}${captchaCount > 0 ? `, ${captchaCount} 篇验证码拦截` : ""}${noDataCount > 0 ? `, ${noDataCount} 篇无数据` : ""}`);

      return {
        unit, status: okCount + partialCount > 0 ? "success" : "failed",
        data: {
          code: 0, data: { papers: enriched, total: enriched.length, successCount: okCount },
          _searchFallback: enriched.map((p) => {
            const { _paperId, _detailStatus, _detailSource, _detailError, _domPreview, ...rest } = p;
            return rest;
          }),
        },
        method: usedCDP ? "cdp_detail_scan" : "browser_detail_scan", responseTime: Date.now() - startTime,
      };
    });
  }

  async collectUnits(units: string[], params: Record<string, string>, session?: CrawlerSession, _authMode?: string): Promise<UnitResult<unknown>[]> {
    if (params.url) {
      try {
        const u = new URL(params.url);
        const kw = u.searchParams.get("wd") || u.searchParams.get("q") || u.searchParams.get("keyword") || "";
        if (kw && !params.keyword) params.keyword = kw;
        const pid = u.searchParams.get("paperid");
        if (pid && !params.paper_id) params.paper_id = pid;
      } catch { /* ignore */ }
    }

    const results: UnitResult[] = [];
    const hasDetail = units.includes("scholar_paper_detail");

    const mergedUnits = units.filter((u) => u !== "scholar_paper_detail");
    for (const unit of mergedUnits) {
      const start = Date.now();
      try {
        const r = await this.dispatchUnit(unit, params, session, undefined, results);
        results.push(r);
      } catch (e: unknown) {
        results.push({ unit, status: "failed", data: null, method: "none", error: e instanceof Error ? e.message : String(e), responseTime: Date.now() - start });
      }
    }

    if (hasDetail) {
      const start = Date.now();
      try {
        const depParams = { ...params, __results__: results as any };
        const r = await this.dispatchUnit("scholar_paper_detail", depParams, session, undefined, results);
        results.push(r);
      } catch (e: unknown) {
        results.push({ unit: "scholar_paper_detail", status: "failed", data: null, method: "none", error: e instanceof Error ? e.message : String(e), responseTime: Date.now() - start });
      }
    }

    return results;
  }
}

// ── 辅助函数 ──

/** 尝试从任意 JSON 对象中提取论文详情。 */
function tryExtractPaperDetailFromAny(obj: any): Record<string, any> | null {
  if (!obj || typeof obj !== "object") return null;
  // 递归搜索
  function search(data: any, depth: number): any {
    if (depth > 4 || !data || typeof data !== "object") return null;
    const paper = data.paper || data.paperDetail || data.detail?.paper || data.data?.paper || data.result || data;
    if (paper.paperId || paper.title || paper.authors) {
      const authors = (paper.authors || []).map((a: any) => a.showName || a.name || "").filter(Boolean);
      const refs = (paper.referenceList || paper.references || []).map((r: any) =>
        (r.title || r.name || "").replace(/<\/?[^>]+>/g, "")
      ).filter(Boolean);
      const citedList = (paper.citedByList || paper.citedList || []).slice(0, 20).map((c: any) =>
        (c.title || c.name || "").replace(/<\/?[^>]+>/g, "")
      ).filter(Boolean);
      return {
        标题: (paper.title || "").replace(/<\/?[^>]+>/g, ""),
        作者: authors.join("; "),
        作者单位: (paper.authors || []).map((a: any) => a.affiliate || "").filter(Boolean).join("; ") || "无",
        发表年份: paper.publishYear || paper.year || "",
        摘要: (paper.abstract || paper.abstractStr || "").replace(/<\/?[^>]+>/g, ""),
        关键词: (paper.keyword || paper.keywords || "").replace(/<\/?[^>]+>/g, ""),
        DOI: paper.doi || "",
        期刊会议: paper.journal || paper.conference || paper.publishInfo?.journalName || paper.publishInfo?.publisher || "",
        被引次数: paper.cited ?? paper.citedCount ?? paper.citationCount ?? 0,
        卷: paper.volume || "",
        期: paper.issue || "",
        页码: paper.pages || paper.pageInfo || "",
        下载量: paper.downloadCount ?? paper.download ?? "无",
        基金项目: (paper.fundInfo || paper.fund || paper.funding || "无"),
        参考文献: refs.length > 0 ? refs.join("\n") : "无",
        作者邮箱: (paper.authorEmails || []).join("; ") || paper.email || "无",
        导师信息: paper.advisor || paper.supervisor || paper.tutor || "无",
        论文分类号: paper.classification || paper.category || paper.classNo || "无",
        原文链接: (paper.pdfList || paper.fulltextList || paper.sourceList || [])
          .filter((s: any) => s.url || s.link)
          .map((s: any) => (s.url || s.link || "")).join("\n"),
        引用论文: citedList.length > 0 ? citedList.join("\n") : "无",
      };
    }
    for (const k of Object.keys(data)) {
      const r = search(data[k], depth + 1);
      if (r) return r;
    }
    return null;
  }
  return search(obj, 0);
}

/** 扫描页面所有 inline script 标签，找包含论文数据的 JSON。 */
async function scanAllScriptsForPaperData(browser: PlaywrightAdapter): Promise<any> {
  const raw = await browser.executeScript<string>(`(() => {
    var scripts = document.querySelectorAll("script:not([src])");
    for (var s of scripts) {
      var t = (s.textContent || "").trim();
      if (t.startsWith("{")) {
        try {
          var d = JSON.parse(t);
          if (d.paperId || d.title || d.authors) return JSON.stringify(d);
        } catch(e) {}
      }
      // Some data stores use window.xxx = JSON
      if (t.includes("window.") && t.includes("paperId")) {
        var m = t.match(/window\\.(\\w+)\\s*=\\s*(\\{.+)/);
        if (m) { try { return m[2]; } catch(e) {} }
      }
    }
    // Also try known data stores on window
    var stores = ["__INITIAL_STATE__", "__NEXT_DATA__", "__NUXT__", "pageData", "paperData"];
    for (var key of stores) {
      try {
        if (window[key]) return JSON.stringify(JSON.parse(JSON.stringify(window[key])));
      } catch(e) {}
    }
    return "{}";
  })()`).catch(() => "{}");
  try { return JSON.parse(raw); } catch { return null; }
}

/** 提取 Schema.org JSON-LD 数据。 */
async function checkJSONLD(browser: PlaywrightAdapter): Promise<any> {
  const raw = await browser.executeScript<string>(`(() => {
    var ld = document.querySelector('script[type="application/ld+json"]');
    if (!ld) return "{}";
    try { return JSON.stringify(JSON.parse(ld.textContent || "{}")); } catch(e) { return "{}"; }
  })()`).catch(() => "{}");
  try { return JSON.parse(raw); } catch { return null; }
}

/** 从 DOM 中提取可见的论文信息。 */
async function extractDOMDetail(browser: PlaywrightAdapter): Promise<Record<string, any>> {
  const raw = await browser.executeScript<string>(`(() => {
    var r = {};
    var txt = document.body.innerText || "";
    r._bodyPreview = txt.slice(0, 3000);
    // 查找结构化的 key: value 模式
    var lines = txt.split("\\n").map(l => l.trim()).filter(Boolean);
    var kv = {};
    for (var l of lines) {
      var parts = l.split(/[：:]/);
      if (parts.length >= 2) {
        var k = parts[0].trim();
        var v = parts.slice(1).join(":").trim();
        if (k.length < 20 && v.length < 500) kv[k] = v;
      }
    }
    r._kvPairs = kv;
    r._hasRealData = Object.keys(kv).length > 3;
    // Try to find specific sections
    var sections = ["作者单位", "基金项目", "关键词", "DOI", "卷期", "页码", "参考文献", "摘要", "被引"];
    for (var sec of sections) {
      for (var [k, v] of Object.entries(kv)) {
        if (k.includes(sec)) { r[sec] = v; break; }
      }
    }
    return JSON.stringify(r);
  })()`).catch(() => "{}");
  try { return JSON.parse(raw); } catch { return {}; }
}
