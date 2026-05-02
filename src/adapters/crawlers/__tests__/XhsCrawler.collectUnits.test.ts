import { XhsCrawler } from "../XhsCrawler";
import { PageData } from "../../../core/ports/ISiteCrawler";

function mockPage(body: unknown, responseTime = 100): PageData {
  return {
    url: "https://edith.xiaohongshu.com/api/test",
    statusCode: 200,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    responseTime,
    capturedAt: new Date().toISOString(),
  };
}

const userInfoOk = () => mockPage({ code: 0, data: { nickname: "测试用户", follower_count: 100 } });
const userPostsFallback = () => mockPage({
  notes: [{ display_title: "笔记1", liked_count: 50 }],
  total: 1,
}, 200);

describe("XhsCrawler.collectUnits", () => {
  let crawler: XhsCrawler;

  beforeEach(() => {
    crawler = new XhsCrawler();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("组合采集: 用户信息 + 用户帖子", async () => {
    const fetchApiSpy = jest.spyOn(crawler as any, "fetchApi");
    fetchApiSpy.mockResolvedValue(userInfoOk());
    const pageSpy = jest.spyOn(crawler as any, "fetchPageData");
    pageSpy.mockResolvedValue(userPostsFallback());

    const results = await crawler.collectUnits(
      ["user_info", "user_posts"],
      { user_id: "test123" },
    );

    expect(results).toHaveLength(2);
    const info = results.find((r) => r.unit === "user_info");
    const posts = results.find((r) => r.unit === "user_posts");
    expect(info?.status).toBe("success");
    expect(posts?.status).toBe("success");
    expect(fetchApiSpy).toHaveBeenCalledWith("用户信息", {}, undefined, "logged_in");
    expect(pageSpy).toHaveBeenCalledWith("用户主页", { user_id: "test123" }, undefined);
  });

  it("游客态: web_session cookie 被过滤", async () => {
    const fetchSpy = jest.spyOn(crawler as any, "fetch");
    fetchSpy.mockResolvedValue(mockPage({ code: 0, data: {} }));

    const sessionObj = {
      cookies: [
        { name: "a1", value: "device_id" },
        { name: "web_session", value: "session_token" },
        { name: "id_token", value: "id_token_val" },
      ],
    };

    await crawler.collectUnits(["user_info"], { user_id: "1" }, sessionObj, "guest");

    const callSession = fetchSpy.mock.calls[0][1] as any;
    const cookieNames = (callSession?.cookies || []).map((c: any) => c.name);
    expect(cookieNames).toContain("a1");
    expect(cookieNames).not.toContain("web_session");
    expect(cookieNames).not.toContain("id_token");
  });

  it("冷却期: 跳过签名请求", async () => {
    const rateLimiter = (crawler as any).rateLimiter;
    jest.spyOn(rateLimiter, "isPaused", "get").mockReturnValue(true);
    const fetchApiSpy = jest.spyOn(crawler as any, "fetchApi");

    const results = await crawler.collectUnits(["user_info", "user_board"], { user_id: "1" });
    expect(fetchApiSpy).not.toHaveBeenCalled();
    expect(results[0].status).toBe("partial");
    expect(results[0].error).toContain("冷却中");
    expect(results[1].status).toBe("partial");
    expect(results[1].error).toContain("冷却中");
  });

  it("未知单元返回失败", async () => {
    const results = await crawler.collectUnits(["unknown_unit" as any], {});
    expect(results[0].status).toBe("failed");
  });
});
