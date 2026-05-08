import { DouyinCrawler } from "../DouyinCrawler";

describe("DouyinCrawler", () => {
  let crawler: DouyinCrawler;

  beforeEach(() => {
    crawler = new DouyinCrawler();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── matches() ──

  it("matches douyin.com URLs", () => {
    expect(crawler.matches("https://www.douyin.com/video/123456")).toBe(true);
    expect(crawler.matches("https://douyin.com/user/abc123")).toBe(true);
    expect(crawler.matches("https://www.douyin.com/")).toBe(true);
  });

  it("rejects non-douyin URLs", () => {
    expect(crawler.matches("https://www.baidu.com")).toBe(false);
    expect(crawler.matches("https://example.com/video/123")).toBe(false);
    expect(crawler.matches("not-a-url")).toBe(false);
  });

  // ── collectUnits URL parsing ──

  it("parses /video/{aweme_id} from URL to extract aweme_id", async () => {
    const dispatchSpy = jest.spyOn(crawler as any, "dispatchUnit");
    dispatchSpy.mockResolvedValue({ unit: "douyin_video_comments", status: "success", data: null, method: "test", responseTime: 0 });

    await crawler.collectUnits(
      ["douyin_video_comments"],
      { url: "https://www.douyin.com/video/7428591823478548788" },
    );

    const callParams = dispatchSpy.mock.calls[0][1] as Record<string, string>;
    expect(callParams.aweme_id).toBe("7428591823478548788");
  });

  it("parses /user/{sec_uid} from URL to extract sec_user_id", async () => {
    const dispatchSpy = jest.spyOn(crawler as any, "dispatchUnit");
    dispatchSpy.mockResolvedValue({ unit: "douyin_video_comments", status: "success", data: null, method: "test", responseTime: 0 });

    await crawler.collectUnits(
      ["douyin_video_comments"],
      { url: "https://www.douyin.com/user/MS4wLjABAAAAabc123xyz" },
    );

    const callParams = dispatchSpy.mock.calls[0][1] as Record<string, string>;
    expect(callParams.sec_user_id).toBe("MS4wLjABAAAAabc123xyz");
  });

  // ── Endpoint registration ──

  it("has douyin_video_comments endpoint registered and returns failed without aweme_id", async () => {
    const result = await (crawler as any).dispatchUnit("douyin_video_comments", {}, undefined);
    expect(result.status).toBe("failed");
    expect(result.error).toContain("aweme_id");
    expect(result.unit).toBe("douyin_video_comments");
  });

  it("rejects unknown units", async () => {
    const result = await (crawler as any).dispatchUnit("nonexistent_unit", {}, undefined);
    expect(result.status).toBe("failed");
    expect(result.error).toContain("未知内容单元");
  });

  // ── Browser path (dispatchUnit with mock fetchPageContent) ──

  it("calls openVideoPage when dispatching with valid aweme_id", async () => {
    const mockBrowser = {
      executeScript: jest.fn().mockResolvedValue(JSON.stringify({
        ok: true,
        comments: [{ cid: "1001", text: "Test comment" }],
        has_more: 0,
        cursor: "0",
        total: 1,
      })),
      close: jest.fn().mockResolvedValue(undefined),
    };
    const pageSpy = jest.spyOn(crawler as any, "fetchPageContent");
    pageSpy.mockResolvedValue({ browser: mockBrowser, startTime: Date.now() });

    const result = await (crawler as any).dispatchUnit(
      "douyin_video_comments",
      { aweme_id: "7428591823478548788" },
      undefined,
    );

    expect(result.status).toBe("success");
    expect(result.data?.data?.comments).toHaveLength(1);
    expect((result.data?.data?.comments[0] as any).cid).toBe("1001");
    expect(mockBrowser.close).toHaveBeenCalled();
    expect(pageSpy).toHaveBeenCalledWith(
      "https://www.douyin.com/video/7428591823478548788",
      undefined,
      ".douyin.com",
      "[class*=\"comment\"]",
    );
  });

  // ── Browser fetch failure handling ──

  it("handles executeScript failure gracefully and returns empty comments", async () => {
    const mockBrowser = {
      executeScript: jest.fn().mockRejectedValue(new Error("Script timeout")),
      close: jest.fn().mockResolvedValue(undefined),
    };
    jest.spyOn(crawler as any, "fetchPageContent").mockResolvedValue({ browser: mockBrowser, startTime: Date.now() });

    const result = await (crawler as any).dispatchUnit(
      "douyin_video_comments",
      { aweme_id: "7428591823478548788" },
      undefined,
    );

    // Handler catches the error internally via .catch() and returns success with empty data
    expect(result.status).toBe("success");
    expect(result.data?.data?.comments).toHaveLength(0);
    expect(mockBrowser.close).toHaveBeenCalled();
  });

  // ── collectUnits with unit merging ──

  it("merges douyin_video_comments and douyin_video_sub_replies into one call", async () => {
    const dispatchSpy = jest.spyOn(crawler as any, "dispatchUnit");
    dispatchSpy.mockResolvedValue({ unit: "douyin_video_comments", status: "success", data: null, method: "test", responseTime: 0 });

    const results = await crawler.collectUnits(
      ["douyin_video_comments", "douyin_video_sub_replies"],
      { url: "https://www.douyin.com/video/7428591823478548788" },
    );

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const callParams = dispatchSpy.mock.calls[0][1] as Record<string, string>;
    expect(callParams.collect_sub_replies).toBe("true");
    expect(results).toHaveLength(1);
  });
});
