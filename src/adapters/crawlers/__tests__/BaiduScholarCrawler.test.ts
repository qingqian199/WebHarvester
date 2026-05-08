import { BaiduScholarCrawler } from "../BaiduScholarCrawler";
import { PageData } from "../../../core/ports/ISiteCrawler";

function mockPage(body: unknown, statusCode = 200, responseTime = 100): PageData {
  return {
    url: "https://xueshu.baidu.com/search/api/search",
    statusCode,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    responseTime,
    capturedAt: new Date().toISOString(),
  };
}

describe("BaiduScholarCrawler", () => {
  let crawler: BaiduScholarCrawler;

  beforeEach(() => {
    crawler = new BaiduScholarCrawler();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── matches() ──

  it("matches xueshu.baidu.com URLs", () => {
    expect(crawler.matches("https://xueshu.baidu.com/")).toBe(true);
    expect(crawler.matches("https://xueshu.baidu.com/usercenter/paper/show?paperid=test123")).toBe(true);
    expect(crawler.matches("https://xueshu.baidu.com/search?wd=test")).toBe(true);
  });

  it("rejects non-xueshu URLs", () => {
    expect(crawler.matches("https://www.baidu.com")).toBe(false);
    expect(crawler.matches("https://example.com/paper/123")).toBe(false);
    expect(crawler.matches("not-a-url")).toBe(false);
  });

  // ── collectUnits URL parsing ──

  it("extracts keyword from search URL via collectUnits", async () => {
    const dispatchSpy = jest.spyOn(crawler as any, "dispatchUnit");
    dispatchSpy.mockResolvedValue({ unit: "scholar_search", status: "success", data: null, method: "api", responseTime: 0 });

    await crawler.collectUnits(
      ["scholar_search"],
      { url: "https://xueshu.baidu.com/search?wd=机器学习&pn=10" },
    );

    const callParams = dispatchSpy.mock.calls[0][1] as Record<string, string>;
    expect(callParams.keyword).toBe("机器学习");
  });

  it("extracts paperid from detail URL via collectUnits", async () => {
    const dispatchSpy = jest.spyOn(crawler as any, "dispatchUnit");
    dispatchSpy.mockResolvedValue({ unit: "scholar_paper_detail", status: "success", data: null, method: "test", responseTime: 0 });

    await crawler.collectUnits(
      ["scholar_paper_detail"],
      { url: "https://xueshu.baidu.com/usercenter/paper/show?paperid=1a2034jk0m4c0pp0cw9x0k70vx754315" },
    );

    const callParams = dispatchSpy.mock.calls[0][1] as Record<string, string>;
    expect(callParams.paper_id).toBe("1a2034jk0m4c0pp0cw9x0k70vx754315");
  });

  it("extracts keyword from q param if wd is not present", async () => {
    const dispatchSpy = jest.spyOn(crawler as any, "dispatchUnit");
    dispatchSpy.mockResolvedValue({ unit: "scholar_search", status: "success", data: null, method: "api", responseTime: 0 });

    await crawler.collectUnits(
      ["scholar_search"],
      { url: "https://xueshu.baidu.com/search?q=深度学习" },
    );

    const callParams = dispatchSpy.mock.calls[0][1] as Record<string, string>;
    expect(callParams.keyword).toBe("深度学习");
  });

  // ── Endpoint registration ──

  it("has scholar_search endpoint registered", async () => {
    const result = await (crawler as any).dispatchUnit("scholar_search", {}, undefined);
    expect(result.status).toBe("failed");
    expect(result.error).toContain("keyword");
  });

  it("has scholar_paper_detail endpoint registered", async () => {
    const result = await (crawler as any).dispatchUnit("scholar_paper_detail", {}, undefined);
    expect(result.status).toBe("failed");
    expect(result.error).toContain("搜索论文");
  });

  it("rejects unknown units", async () => {
    const result = await (crawler as any).dispatchUnit("nonexistent", {}, undefined);
    expect(result.status).toBe("failed");
    expect(result.error).toContain("未知内容单元");
  });

  // ── Search result extraction ──

  it("extracts paper fields from search API response", async () => {
    const mockPapers = [
      {
        paperId: "p001",
        title: "<em>机器学习</em>综述",
        authors: [{ showName: "作者A", affiliate: "大学A" }, { showName: "作者B", affiliate: "大学B" }],
        publishYear: "2024",
        abstract: "<b>摘要</b>内容示例",
        keyword: "机器学习; 深度学习",
        doi: "10.1234/test",
        cited: 42,
        publishInfo: { journalName: "计算机学报" },
        sourceList: [{ url: "https://example.com/paper", anchor: "全文链接", domain: "example.com" }],
      },
      {
        paperId: "p002",
        title: "深度学习在NLP中的应用",
        authors: [{ showName: "作者C" }],
        publishYear: "2023",
        abstract: "这是第二篇论文的摘要",
        keyword: "深度学习; NLP",
        doi: "",
        cited: 10,
      },
    ];

    const fetchSpy = jest.spyOn(crawler as any, "fetch");
    fetchSpy.mockResolvedValue(mockPage({
      status: { code: 0 },
      data: { paper: { paperList: mockPapers } },
    }));

    const result = await (crawler as any).dispatchUnit(
      "scholar_search",
      { keyword: "机器学习", max_pages: "1" },
      undefined,
    );

    expect(result.status).toBe("success");
    const papers = result.data?.data?.papers || [];
    expect(papers).toHaveLength(2);

    // Verify paper 1 fields match the standard academic template
    const p1 = papers[0];
    expect(p1.标题).toBe("机器学习综述"); // <em> stripped
    expect(p1.作者).toBe("作者A; 作者B");
    expect(p1.作者单位).toBe("大学A; 大学B");
    expect(p1.发表年份).toBe("2024");
    expect(p1.摘要).toBe("摘要内容示例"); // <b> stripped
    expect(p1.关键词).toBe("机器学习; 深度学习");
    expect(p1.DOI).toBe("10.1234/test");
    expect(p1.被引次数).toBe(42);
    expect(p1.期刊会议).toBe("计算机学报");
    expect(p1._paperId).toBe("p001");
  });

  it("stops pagination on API error code", async () => {
    const fetchSpy = jest.spyOn(crawler as any, "fetch");
    fetchSpy.mockResolvedValue(mockPage({ status: { code: 1 } }));

    const result = await (crawler as any).dispatchUnit(
      "scholar_search",
      { keyword: "test", max_pages: "3" },
      undefined,
    );

    expect(result.status).toBe("success");
    expect(result.data?.data?.papers || []).toHaveLength(0);
    // Should have stopped after first page (status code !== 0)
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  // ── SSR extraction ──

  it("extracts paper details via SSR strategy", async () => {
    const mockBrowser = {
      executeScript: jest.fn().mockResolvedValue(""),
      close: jest.fn().mockResolvedValue(undefined),
    };

    // Mock fetchPageContent so we don't launch a real browser
    jest.spyOn(crawler as any, "fetchPageContent").mockResolvedValue({
      browser: mockBrowser,
      startTime: Date.now(),
    });

    // Mock extractSSRData to simulate SSR data being found
    jest.spyOn(crawler as any, "extractSSRData").mockResolvedValue({
      body: JSON.stringify({
        _hasInitState: true,
        data: {
          paper: {
            paperId: "ssr001",
            title: "SSR提取论文标题",
            authors: [{ name: "作者SSR", affiliate: "SSR大学" }],
            publishYear: "2025",
            abstract: "这是通过SSR提取的论文摘要",
            keyword: "SSR; 测试",
            doi: "10.1234/ssr-test",
            cited: 99,
            volume: "V10",
            issue: "I3",
            pages: "100-110",
            fund: "国家自然科学基金",
            referenceList: [{ title: "引用论文A" }, { title: "引用论文B" }],
          },
        },
      }),
    });

    // Must pass paper_id so it doesn't look for prior search results
    const result = await (crawler as any).dispatchUnit(
      "scholar_paper_detail",
      { paper_id: "ssr001", max_details: "1" },
      undefined,
    );

    expect(result.status).toBe("success");
    const papers = result.data?.data?.papers || [];
    expect(papers).toHaveLength(1);

    const p = papers[0];
    expect(p.标题).toBe("SSR提取论文标题");
    expect(p.作者).toContain("作者SSR");
    expect(p.作者单位).toContain("SSR大学");
    expect(p.发表年份).toBe("2025");
    expect(p.摘要).toBe("这是通过SSR提取的论文摘要");
    expect(p.关键词).toBe("SSR; 测试");
    expect(p.DOI).toBe("10.1234/ssr-test");
    expect(p.被引次数).toBe(99);
    expect(p._detailStatus).toBe("ok");
    expect(p._detailSource).toBe("ssr");
  });

  // ── Detail format output ──

  it("includes _searchFallback in output for format compatibility", async () => {
    const mockBrowser = {
      executeScript: jest.fn().mockResolvedValue(""),
      close: jest.fn().mockResolvedValue(undefined),
    };
    jest.spyOn(crawler as any, "fetchPageContent").mockResolvedValue({
      browser: mockBrowser,
      startTime: Date.now(),
    });
    // Mock SSR to return valid paper data so detail succeeds
    jest.spyOn(crawler as any, "extractSSRData").mockResolvedValue({
      body: JSON.stringify({
        _hasInitState: true,
        data: {
          paper: {
            paperId: "p_fmt_01",
            title: "格式测试论文",
            authors: [{ name: "作者F", affiliate: "大学F" }],
            publishYear: "2024",
            abstract: "测试摘要",
            keyword: "测试",
            doi: "10.1234/fmt",
            cited: 5,
          },
        },
      }),
    });

    const detailResult = await (crawler as any).dispatchUnit(
      "scholar_paper_detail",
      { paper_id: "p_fmt_01", max_details: "1" },
      undefined,
    );

    expect(detailResult.status).toBe("success");
    const data = detailResult.data;
    expect(data).toBeDefined();

    const fallback = data._searchFallback;
    expect(fallback).toBeDefined();
    expect(Array.isArray(fallback)).toBe(true);

    if (fallback.length > 0) {
      const fbItem = fallback[0];
      expect(fbItem).not.toHaveProperty("_paperId");
      expect(fbItem).not.toHaveProperty("_detailStatus");
      expect(fbItem).not.toHaveProperty("_detailSource");
      expect(fbItem.标题).toBeDefined();
      expect(fbItem.作者).toBeDefined();
    }
  });

  // ── collectUnits dependency order ──

  it("collects detail after search when both units requested", async () => {
    const dispatchSpy = jest.spyOn(crawler as any, "dispatchUnit");
    dispatchSpy.mockResolvedValue({ unit: "test", status: "success", data: null, method: "test", responseTime: 0 });

    await crawler.collectUnits(
      ["scholar_search", "scholar_paper_detail"],
      { keyword: "测试" },
    );

    // Search should be dispatched first, then detail
    expect(dispatchSpy.mock.calls[0][0]).toBe("scholar_search");
    expect(dispatchSpy.mock.calls[1][0]).toBe("scholar_paper_detail");

    // Detail should receive __results__ with prior results
    const detailParams = dispatchSpy.mock.calls[1][1] as Record<string, any>;
    expect(detailParams.__results__).toBeDefined();
  });
});
