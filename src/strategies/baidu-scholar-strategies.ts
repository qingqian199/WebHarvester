import { PlaywrightAdapter } from "../adapters/PlaywrightAdapter";

// ── 策略类型 ──

export interface PaperExtractStrategy {
  name: string;
  execute: (browser: PlaywrightAdapter, pid: string) => Promise<Record<string, unknown> | null>;
}

// ── 辅助函数（原 BaiduScholarCrawler 中内联） ──

function tryExtractPaperDetailFromAny(obj: unknown): Record<string, unknown> | null {
  if (!obj || typeof obj !== "object") return null;
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

async function scanAllScriptsForPaperData(browser: PlaywrightAdapter): Promise<any> {
  const raw = await browser.executeScript<string>(`(() => {
    var scripts = document.querySelectorAll("script:not([src])");
    for (var s of scripts) {
      var t = (s.textContent || "").trim();
      if (t.startsWith("{")) {
        try { var d = JSON.parse(t); if (d.paperId || d.title || d.authors) return JSON.stringify(d); } catch(e) {}
      }
      if (t.includes("window.") && t.includes("paperId")) {
        var m = t.match(/window\\.(\\w+)\\s*=\\s*(\\{.+)/);
        if (m) { try { return m[2]; } catch(e) {} }
      }
    }
    var stores = ["__INITIAL_STATE__", "__NEXT_DATA__", "__NUXT__", "pageData", "paperData"];
    for (var key of stores) {
      try { if (window[key]) return JSON.stringify(JSON.parse(JSON.stringify(window[key]))); } catch(e) {}
    }
    return "{}";
  })()`).catch(() => "{}");
  try { return JSON.parse(raw); } catch { return null; }
}

async function checkJSONLD(browser: PlaywrightAdapter): Promise<any> {
  const raw = await browser.executeScript<string>(`(() => {
    var ld = document.querySelector('script[type="application/ld+json"]');
    if (!ld) return "{}";
    try { return JSON.stringify(JSON.parse(ld.textContent || "{}")); } catch(e) { return "{}"; }
  })()`).catch(() => "{}");
  try { return JSON.parse(raw); } catch { return null; }
}

async function extractDOMDetail(browser: PlaywrightAdapter): Promise<Record<string, any>> {
  const raw = await browser.executeScript<string>(`(() => {
    var r = {};
    var txt = document.body.innerText || "";
    r._bodyPreview = txt.slice(0, 3000);
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

// ── 策略工厂 ──

/** SSR 数据提取（__INITIAL_STATE__ / __NEXT_DATA__ / __NUXT_DATA__） */
export const ssrStrategy: PaperExtractStrategy = {
  name: "ssr",
  execute: async (browser, _pid) => {
    const ssrResult = await browser.executeScript<string>(`(() => {
      const r = {}; const is = window.__INITIAL_STATE__;
      if (is) { r._hasInitState = true; r.data = JSON.parse(JSON.stringify(is)); }
      const nd = document.getElementById("__NEXT_DATA__");
      if (nd) { r._hasNextData = true; try { r.nextData = JSON.parse(nd.textContent || "{}"); } catch {} }
      const nu = document.getElementById("__NUXT_DATA__");
      if (nu) { r._hasNuxtData = true; try { r.nuxtData = JSON.parse(nu.textContent || "{}"); } catch {} }
      return JSON.stringify(r);
    })()`).catch(() => "{}");
    const parsed = JSON.parse(ssrResult);
    if (parsed._hasInitState || parsed._hasNextData || parsed._hasNuxtData) {
      const ds = parsed.data || parsed.nextData?.props?.pageProps || parsed.nuxtData;
      const detail = tryExtractPaperDetailFromAny(ds || parsed);
      if (detail) return detail;
    }
    return null;
  },
};

/** inline script 扫描 */
export const inlineScriptStrategy: PaperExtractStrategy = {
  name: "inline_script",
  execute: async (browser, _pid) => {
    const data = await scanAllScriptsForPaperData(browser);
    if (data && data.paperId) {
      const detail = tryExtractPaperDetailFromAny(data);
      return detail || null;
    }
    return null;
  },
};

/** JSON-LD 提取 */
export const jsonldStrategy: PaperExtractStrategy = {
  name: "jsonld",
  execute: async (browser, _pid) => {
    const jsonld = await checkJSONLD(browser);
    if (jsonld && (jsonld.name || jsonld.description)) {
      const mapped: Record<string, unknown> = {};
      if (jsonld.name) mapped.标题 = jsonld.name;
      if (jsonld.description) mapped.摘要 = jsonld.description;
      if (jsonld.datePublished) mapped.发表年份 = jsonld.datePublished.slice(0, 4);
      if (jsonld.author) mapped.作者 = Array.isArray(jsonld.author) ? jsonld.author.map((a: any) => a.name || "").filter(Boolean).join("; ") : jsonld.author.name || "";
      return mapped;
    }
    return null;
  },
};

/** DOM 文本提取 */
export const domStrategy: PaperExtractStrategy = {
  name: "dom",
  execute: async (browser, _pid) => {
    const detail = await extractDOMDetail(browser);
    if (detail && Object.keys(detail).length > 0) {
      return { ...detail, _hasRealData: detail._hasRealData };
    }
    return null;
  },
};

/** 默认策略链顺序 */
export const DEFAULT_PAPER_STRATEGIES: PaperExtractStrategy[] = [
  ssrStrategy,
  inlineScriptStrategy,
  jsonldStrategy,
  domStrategy,
];
