import { BilibiliCrawler } from "../BilibiliCrawler";
import { PageData } from "../../../core/ports/ISiteCrawler";
// PageData used in mockPage return type

function mockPage(body: unknown, responseTime = 100): PageData {
  return {
    url: "https://api.bilibili.com/x/test",
    statusCode: 200,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    responseTime,
    capturedAt: new Date().toISOString(),
  };
}

const videoInfoOk = () => mockPage({ code: 0, data: { title: "测试视频", stat: { view: 1000 } } });
const videoInfo352 = () => mockPage({ code: -352, message: "风控" });
const commentsOk = () => mockPage({
  code: 0,
  data: {
    replies: [
      { rpid: 1, member: { uname: "用户A" }, content: { message: "评论1" }, like: 10, rcount: 0, ctime: 100 },
      { rpid: 2, member: { uname: "用户B" }, content: { message: "评论2" }, like: 5, rcount: 2, ctime: 200 },
    ],
    cursor: { all_count: 2, is_end: true, next: 0 },
  },
});
const subReplyOk = () => mockPage({
  code: 0,
  data: {
    replies: [{ rpid: 10, member: { uname: "回复A" }, content: { message: "子回复" }, like: 1, ctime: 300 }],
    cursor: { is_end: true, next: 0 },
  },
});
const pageFallback = () => mockPage({ title: "页面提取", content: "兜底数据" }, 200);

describe("BilibiliCrawler.collectUnits", () => {
  let crawler: BilibiliCrawler;

  beforeEach(() => {
    crawler = new BilibiliCrawler();
    crawler.setWbiKeys("test_img_key", "test_sub_key");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("组合采集: 视频信息 + 视频评论 — 两个单元都被正确调用", async () => {
    const fetchApiSpy = jest.spyOn(crawler as any, "fetchApi");
    fetchApiSpy.mockImplementation(((name: string) => {
      if (name === "视频信息") return videoInfoOk();
      if (name === "视频评论") return commentsOk();
      return mockPage({ code: 0 });
    }) as any);

    const results = await crawler.collectUnits(
      ["bili_video_info", "bili_video_comments"],
      { aid: "123" },
    );

    expect(results).toHaveLength(2);
    const info = results.find((r) => r.unit === "bili_video_info");
    const comments = results.find((r) => r.unit === "bili_video_comments");
    expect(info?.status).toBe("success");
    expect(comments?.status).toBe("success");
    expect(fetchApiSpy).toHaveBeenCalledWith("视频信息", expect.any(Object), undefined);
    expect(fetchApiSpy).toHaveBeenCalledWith("视频评论", expect.any(Object), undefined);
  });

  it("子回复自动遍历: 先调评论 → 遍历 rpid → 调子回复", async () => {
    const fetchApiSpy = jest.spyOn(crawler as any, "fetchApi");
    fetchApiSpy.mockImplementation(((name: string) => {
      if (name === "视频评论") return commentsOk();
      if (name === "视频子回复") return subReplyOk();
      return mockPage({ code: 0 });
    }) as any);

    const results = await crawler.collectUnits(
      ["bili_video_comments", "bili_video_sub_replies"],
      { aid: "123" },
    );

    expect(results).toHaveLength(2);
    expect(results[0].unit).toBe("bili_video_comments");
    expect(results[0].status).toBe("success");
    expect(results[1].unit).toBe("bili_video_sub_replies");
    expect(results[1].status).toBe("success");
    expect(fetchApiSpy).toHaveBeenCalledWith("视频子回复", expect.objectContaining({ root: "1" }), undefined);
    expect(fetchApiSpy).toHaveBeenCalledWith("视频子回复", expect.objectContaining({ root: "2" }), undefined);
    const d = results[1].data as any;
    expect(d.data.expanded_count).toBeGreaterThan(0);
  });

  it("风控降级: -352 → 自动重试 → 最终成功", async () => {
    const fetchApiSpy = jest.spyOn(crawler as any, "fetchApi");
    let callCount = 0;
    fetchApiSpy.mockImplementation(((name: string) => {
      callCount++;
      if (name === "视频信息") {
        if (callCount <= 1) return videoInfo352();
        return videoInfoOk();
      }
      return mockPage({ code: 0 });
    }) as any);
    const pageSpy = jest.spyOn(crawler as any, "fetchPageData");
    pageSpy.mockResolvedValue(pageFallback());

    const results = await crawler.collectUnits(["bili_video_info"], { aid: "123" });
    const info = results.find((r) => r.unit === "bili_video_info");
    expect(info).toBeDefined();
    expect(info!.status).toBe("success");
    expect(info!.method).toBe("signature");
    expect(fetchApiSpy).toHaveBeenCalledTimes(2);
  });

  it("URL 含 aid 自动补全免追问", async () => {
    const fetchApiSpy = jest.spyOn(crawler as any, "fetchApi");
    fetchApiSpy.mockImplementation(((name: string) => {
      if (name === "视频信息") return mockPage({ code: 0, data: { title: "ok" } });
      return mockPage({ code: 0 });
    }) as any);
    await crawler.collectUnits(["bili_video_info"], { url: "https://www.bilibili.com/video/BV1xx4y1k7zQ" });
    expect(fetchApiSpy).toHaveBeenCalled();
  });

  it("空评论不触发子回复", async () => {
    const fetchApiSpy = jest.spyOn(crawler as any, "fetchApi");
    fetchApiSpy.mockImplementation(((name: string) => {
      if (name === "视频评论") return mockPage({ code: 0, data: { replies: [], cursor: { all_count: 0 } } });
      return mockPage({ code: 0 });
    }) as any);

    const results = await crawler.collectUnits(
      ["bili_video_comments", "bili_video_sub_replies"],
      { aid: "123" },
    );
    const sub = results.find((r) => r.unit === "bili_video_sub_replies");
    expect(sub).toBeDefined();
    expect(sub!.status).toBe("success");
    const d = sub!.data as any;
    expect(d.data.total_replies).toBe(0);
  });

  it("缺少 oid 时返回失败", async () => {
    const results = await crawler.collectUnits(["bili_video_comments"], {});
    expect(results[0].status).toBe("failed");
    expect(results[0].error).toContain("缺少 oid");
  });

  it("未知单元返回失败", async () => {
    const results = await crawler.collectUnits(["unknown_unit" as any], { aid: "123" });
    expect(results[0].status).toBe("failed");
  });

  it("子回复自动遍历: 并发数不超过 3", async () => {
    const fetchApiSpy = jest.spyOn(crawler as any, "fetchApi");
    let maxConcurrent = 0;
    let concurrent = 0;
    fetchApiSpy.mockImplementation(((name: string) => {
      if (name === "视频评论") {
        const manyReplies = Array.from({ length: 6 }, (_, i) => ({
          rpid: i + 1, member: { uname: `U${i}` }, content: { message: "c" }, like: 0, rcount: 0, ctime: i,
        }));
        return mockPage({ code: 0, data: { replies: manyReplies, cursor: { all_count: 6, is_end: true } } });
      }
      if (name === "视频子回复") {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        return new Promise((resolve) => setTimeout(() => { concurrent--; resolve(subReplyOk()); }, 20));
      }
      return mockPage({ code: 0 });
    }) as any);

    await crawler.collectUnits(["bili_video_comments", "bili_video_sub_replies"], { aid: "123" });
    expect(maxConcurrent).toBeLessThanOrEqual(3);
  });
});
