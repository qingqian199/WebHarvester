import { ZhihuCrawler } from "../ZhihuCrawler";
import { PageData } from "../../../core/ports/ISiteCrawler";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _getDesc = (o: any, p: string) => Object.getOwnPropertyDescriptor(o, p) ?? Object.getOwnPropertyDescriptor(Object.getPrototypeOf(o), p);
const _spyOnGetters: Array<[object, string | symbol, PropertyDescriptor | undefined]> = [];

function mockPage(body: unknown, statusCode = 200, responseTime = 100): PageData {
  return {
    url: "https://www.zhihu.com/api/test",
    statusCode,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    responseTime,
    capturedAt: new Date().toISOString(),
  };
}

const userInfoOk = () => mockPage({ data: { name: "知乎用户", follower_count: 500 } });
const hotSearchOk = () => mockPage({ data: { hot_list: [{ query: "热搜1", heat: 1000 }] } });
const searchFallback = () => mockPage({ title: "搜索页面", content: "兜底数据" }, 200, 200);

describe("ZhihuCrawler.collectUnits", () => {
  let crawler: ZhihuCrawler;

  beforeEach(() => {
    crawler = new ZhihuCrawler();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    for (const [o, p, d] of _spyOnGetters) {
      if (d) Object.defineProperty(o, p as string, d);
    }
    _spyOnGetters.length = 0;
  });

  it("组合采集: 用户信息 + 热门搜索", async () => {
    const fetchApiSpy = jest.spyOn(crawler as any, "fetchApi");
    fetchApiSpy.mockImplementation(((name: string) => {
      if (name === "当前用户") return userInfoOk();
      if (name === "热门搜索") return hotSearchOk();
      return mockPage({});
    }) as any);

    const results = await crawler.collectUnits(["zhihu_user_info", "zhihu_hot_search"], {});
    expect(results).toHaveLength(2);
    const info = results.find((r) => r.unit === "zhihu_user_info");
    const hot = results.find((r) => r.unit === "zhihu_hot_search");
    expect(info?.status).toBe("success");
    expect(hot?.status).toBe("success");
    expect(fetchApiSpy).toHaveBeenCalledWith("当前用户", {}, undefined);
    expect(fetchApiSpy).toHaveBeenCalledWith("热门搜索", {}, undefined);
  });

  it("搜索降级: 搜索 API 不可用 → 页面提取", async () => {
    jest.spyOn(crawler as any, "fetchApi").mockRejectedValue(new Error("API不可用"));
    const pageSpy = jest.spyOn(crawler as any, "fetchPageData");
    pageSpy.mockResolvedValue(searchFallback());

    const results = await crawler.collectUnits(["zhihu_search"], { keyword: "测试" });
    expect(results[0].status).toBe("success");
    expect(results[0].method).toBe("html_extract");
    expect(pageSpy).toHaveBeenCalledWith("search", { keyword: "测试" }, undefined);
  });

  it("冷却期跳过签名请求", async () => {
    const rateLimiter = (crawler as any).rateLimiter;
    const _d = _getDesc(rateLimiter, "isPaused");
    if (_d) {
      Object.defineProperty(rateLimiter, "isPaused", { get: () => true, configurable: true });
      _spyOnGetters.push([rateLimiter, "isPaused", _d]);
    }
    const fetchApiSpy = jest.spyOn(crawler as any, "fetchApi");

    const results = await crawler.collectUnits(["zhihu_hot_search", "zhihu_user_info"], {});
    expect(fetchApiSpy).not.toHaveBeenCalled();
    expect(results.every((r) => r.status === "partial")).toBe(true);
  });

  it("未知单元返回失败", async () => {
    const results = await crawler.collectUnits(["unknown_unit" as any], {});
    expect(results[0].status).toBe("failed");
  });
});
