import { CrawlerSession } from "../../core/ports/ISiteCrawler";
import { IProxyProvider } from "../../core/ports/IProxyProvider";
import { UnitResult } from "../../core/models/ContentUnit";
import { BaseCrawler } from "./BaseCrawler";
import { PlaywrightAdapter } from "../PlaywrightAdapter";
import { BrowserLifecycleManager } from "../BrowserLifecycleManager";
import { injectAntiDetection } from "../../browser/anti-detection-injector";
import { waitForUserAction, detection } from "../../browser/user-action-waiter";
import { humanBehaviorSession } from "../../browser/human-behavior-simulator";
import { DEFAULT_PAPER_STRATEGIES } from "../../strategies/baidu-scholar-strategies";
import fs from "fs/promises";
import path from "path";

const SCHOLAR_DOMAIN = "xueshu.baidu.com";
const CAPTCHA_SCREENSHOT_DIR = "captcha_screenshots";

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

/** 从 detail 页检查是否有 CAPTCHA，如有则截图并提示。返回 true 表示被拦截。 */
async function checkCaptcha(browser: PlaywrightAdapter, pid?: string, logger?: any): Promise<boolean> {
  try {
    const title = await browser.executeScript<string>("document.title").catch(() => "") as unknown as string;
    const isCaptcha = title.includes("百度安全验证") || title.includes("安全验证");
    if (isCaptcha) {
      // 截图保存
      try {
        const dir = path.resolve(CAPTCHA_SCREENSHOT_DIR);
        await fs.mkdir(dir, { recursive: true });
        const b = (browser as any).lcm as BrowserLifecycleManager | undefined;
        const page = b?.getPage?.();
        if (page) {
          const filename = `baidu_captcha_${pid || Date.now()}_${Date.now()}.png`;
          await page.screenshot({ path: path.join(dir, filename), fullPage: false });
          logger?.warn(`  验证码截图已保存: ${dir}/${filename}`);
        }
      } catch {}
      logger?.warn("  ⛔ 百度安全验证拦截，请手动打开详情页完成验证后按回车继续");
      logger?.warn("  💡 建议: 使用非 headless 模式 (headless: false) 可大幅降低触发概率");
    }
    return isCaptcha;
  } catch { return false; }
}

/**
 * 创建具有反检测能力的浏览器页面。
 * 降级链：headless=false（可视模式）→ headless=true（隐身模式）
 * 添加额外启动参数和初始化脚本以绕过 BIOS 检测。
 */
async function createStealthPage(
  url: string,
  logger: any,
): Promise<{ browser: PlaywrightAdapter; page: any } | null> {
  // CI/测试环境跳过 headless=false（避免启动可视窗口）
  const modes = process.env.CI ? [true] : [false, true];
  for (const headless of modes) {
    try {
      const lcm = new BrowserLifecycleManager(logger);
      const page = await (lcm as any).launch(
        url,
        headless,
        undefined,
        "domcontentloaded",
        headless ? 20000 : 5000,
      );

      await injectAntiDetection(page);

      const adapter = new PlaywrightAdapter(logger);
      (adapter as any).lcm = lcm;
      (adapter as any).lcm.page = page;
      (adapter as any).lcm.pooled = false;

      logger.info(`  浏览器启动成功 (${headless ? "headless" : "可视模式"})`);
      return { browser: adapter, page };
    } catch (e) {
      logger.info(`  浏览器启动失败 (headless=${headless}): ${(e as Error).message}`);
    }
  }
  return null;
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
      const startTime = Date.now();
      let usedCDP = false;

      // ── 前置：CDP 浏览器只连接一次 ──
      let cdpContext: any = null;
      try {
        const { getBrowser: getProviderBrowser } = await import("../../services/BrowserProvider");
        const inst = await getProviderBrowser("__cdp__", true);
        if (inst.isCDP && inst.context) {
          cdpContext = inst.context;
          usedCDP = true;
          const { setMaxPagesPerBrowser } = await import("../../utils/BrowserPool");
          setMaxPagesPerBrowser("__cdp__", Math.min(targets.length, 3));
          this.logger.info(`  CDP 浏览器已就绪，并发 ${Math.min(targets.length, 3)} 页`);
        }
      } catch (e: any) {
        this.logger.warn(`  CDP 连接失败: ${e.message}`);
      }

      // ── 提取单篇论文详情的函数 ──
      const extractPaper = async (target: Record<string, any>, idx: number): Promise<Record<string, any>> => {
        const pid = target._paperId || target.paperId || "";

        // CDP 模式：从页面池获取 Page
        if (cdpContext) {
          const { acquirePage, releasePage } = await import("../../utils/BrowserPool");
          let rawPage: any = null;
          try {
            rawPage = await acquirePage("__cdp__");
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
            await new Promise((r) => setTimeout(r, 2000 + Math.floor(Math.random() * 1000)));

            // ── 真人行为模拟（在数据提取之前） ──
            const behaviorIntensity = (process.env.WH_BEHAVIOR_INTENSITY || "medium") as "light" | "medium" | "heavy" | "off";
            if (behaviorIntensity !== "off") {
              this.logger.debug(`  详情 ${idx + 1}: 执行行为模拟 (${behaviorIntensity})`);
              await humanBehaviorSession(rawPage, behaviorIntensity);
            }

            // 策略 A: API 响应拦截
            for (const ar of apiResponses) {
              const detail = tryExtractPaperDetailFromAny(ar.data);
              if (detail) {
                await releasePage(rawPage, "__cdp__");
                return { ...target, ...detail, _detailStatus: "ok", _detailSource: `api:${ar.url}` };
              }
            }

            // 策略 B: CAPTCHA 检查 → 等待用户手动处理
            const title = await rawPage.evaluate(() => document.title).catch(() => "");
            if (title.includes("百度安全验证") || title.includes("安全验证")) {
              try {
                const { default: p } = await import("path");
                const dir = p.resolve("captcha_screenshots");
                await fs.mkdir(dir, { recursive: true });
                await rawPage.screenshot({ path: p.join(dir, `baidu_captcha_${pid}_${Date.now()}.png`), fullPage: false });
              } catch {}

              this.logger.warn(`  详情 ${idx + 1}: ⛔ 百度安全验证拦截，等待用户手动验证...`);

              // 释放并发槽位，等待用户操作
              const { markPageWaiting, markPageActive } = await import("../../utils/BrowserPool");
              markPageWaiting(rawPage, "__cdp__");

              const startWait = Date.now();
              try {
                await waitForUserAction({
                  timeout: 300000,
                  condition: detection.captchaGone(rawPage),
                  message: `百度学术验证码 (${pid.slice(0, 16)})，请在 Chrome 窗口中完成验证，完成后将自动继续采集论文详情`,
                });
                this.logger.info(`  详情 ${idx + 1}: ✅ 验证码已通过 (等待 ${((Date.now() - startWait) / 1000).toFixed(0)}s)`);
                markPageActive(rawPage, "__cdp__");
                // 重新检查标题
                const newTitle = await rawPage.evaluate(() => document.title).catch(() => "");
                if (newTitle.includes("百度安全验证") || newTitle.includes("安全验证")) {
                  await releasePage(rawPage, "__cdp__");
                  return { ...target, _detailStatus: "captcha" };
                }
              } catch (e) {
                this.logger.warn(`  详情 ${idx + 1}: ⛔ 验证码等待超时 (${((Date.now() - startWait) / 1000).toFixed(0)}s)`);
                markPageActive(rawPage, "__cdp__");
                await releasePage(rawPage, "__cdp__");
                return { ...target, _detailStatus: "captcha", _detailError: e instanceof Error ? e.message : "等待超时" };
              }
            }

            // 策略链: SSR → Inline Script → JSON-LD → DOM
            const adapter = new PlaywrightAdapter(this.logger);
            (adapter as any).lcm.page = rawPage;
            (adapter as any).lcm.context = cdpContext;

            const { data: detail, source } = await this.runStrategyChain(
              DEFAULT_PAPER_STRATEGIES.map((strategy) => ({
                name: strategy.name,
                execute: () => strategy.execute(adapter, pid),
              })),
            );

            if (detail) {
              await releasePage(rawPage, "__cdp__");
              return { ...target, ...detail, _detailStatus: detail._hasRealData ? "ok" : "partial", _detailSource: source };
            }

            await releasePage(rawPage, "__cdp__");
            return { ...target, _detailStatus: "no_data" };
          } catch (e: any) {
            if (rawPage) { await releasePage(rawPage, "__cdp__").catch(() => {}); }
            // 页面池死锁：不返回错误，降级到 Stealth 模式继续
            const { PoolDeadlockError } = await import("../../utils/BrowserPool");
            if (e instanceof PoolDeadlockError) {
              this.logger.warn(`  ⚠️ 详情 ${idx + 1}: 页面池死锁，降级到无头浏览器模式处理 (${pid.slice(0, 16)}...)`);
            } else {
              return { ...target, _detailStatus: "error", _detailError: e.message };
            }
          }
        }

        // ── 非 CDP 模式：stealth 浏览器 → fetchPageContent ──
        let browser: PlaywrightAdapter | null = null;
        try {
          if (!process.env.JEST_WORKER_ID) {
            const stealth = await createStealthPage(
              `https://xueshu.baidu.com/usercenter/paper/show?paperid=${pid}`,
              this.logger,
            );
            if (stealth) browser = stealth.browser;
          }
          if (!browser) {
            const result = await this.fetchPageContent(
              `https://xueshu.baidu.com/usercenter/paper/show?paperid=${pid}`,
              session, ".xueshu.baidu.com",
            );
            browser = result.browser;
          }

          const isCaptcha = await checkCaptcha(browser!, pid, this.logger);
          if (isCaptcha) return { ...target, _detailStatus: "captcha" };

          const ssrResult = await this.extractSSRData(browser!, "scholar_paper_detail");
          if (ssrResult.body) {
            let sp: any; try { sp = JSON.parse(ssrResult.body); } catch {}
            if (sp && (sp._hasInitState || sp._hasNextData || sp._hasNuxtData)) {
              const ds = sp.data || sp.nextData?.props?.pageProps || sp.nuxtData;
              const detail = tryExtractPaperDetailFromAny(ds || sp);
              if (detail) return { ...target, ...detail, _detailStatus: "ok", _detailSource: "ssr" };
            }
          }

          const sd = await scanAllScriptsForPaperData(browser!);
          if (sd && sd.paperId) {
            const detail = tryExtractPaperDetailFromAny(sd);
            return { ...target, ...(detail || {}), _detailStatus: "ok", _detailSource: "inline_script" };
          }

          const jd = await checkJSONLD(browser!);
          if (jd && (jd.name || jd.description)) {
            const mapped: Record<string, string> = {};
            if (jd.name) mapped.标题 = jd.name;
            if (jd.description) mapped.摘要 = jd.description;
            if (jd.datePublished) mapped.发表年份 = jd.datePublished.slice(0, 4);
            if (jd.author) mapped.作者 = Array.isArray(jd.author) ? jd.author.map((a: any) => a.name || "").filter(Boolean).join("; ") : jd.author.name || "";
            return { ...target, ...mapped, _detailStatus: "partial", _detailSource: "jsonld" };
          }

          const dd = await extractDOMDetail(browser!);
          if (dd && Object.keys(dd).length > 0) {
            return { ...target, ...dd, _detailStatus: dd._hasRealData ? "ok" : "partial", _detailSource: "dom" };
          }

          return { ...target, _detailStatus: "no_data" };
        } catch (e: any) {
          return { ...target, _detailStatus: "error", _detailError: e.message };
        } finally {
          if (browser) await (browser as any).close().catch(() => {});
        }
      };

      // ── 执行：CDP 并发 / 非 CDP 串行 ──
      const concurrency = cdpContext ? Math.min(targets.length, 3) : 1;
      const enriched: Record<string, any>[] = [];

      if (concurrency > 1) {
        // CDP 并发执行
        const results = await this.runWithConcurrency(
          targets.map((t, i) => ({ target: t, idx: i })),
          concurrency,
          async ({ target, idx }) => {
            await new Promise((r) => setTimeout(r, idx * 200)); // 错峰
            return extractPaper(target, idx);
          },
        );
        enriched.push(...results);
      } else {
        // 串行（非 CDP 或单篇）
        for (let i = 0; i < targets.length; i++) {
          this.logger.info(`  详情 ${i + 1}/${targets.length}: 处理中...`);
          const result = await extractPaper(targets[i], i);
          enriched.push(result);
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
