import { describe, it, expect, beforeEach } from "@jest/globals";

import { MiyousheCrawler } from "../MiyousheCrawler";

const isBun = typeof process !== "undefined" && !!process.versions?.bun;
(isBun ? describe.skip : describe)("MiyousheCrawler", () => {
  let crawler: MiyousheCrawler;
  beforeEach(() => {
    crawler = new MiyousheCrawler();
  });

  it("matches miyoushe.com URLs", () => {
    expect(crawler.matches("https://www.miyoushe.com/ys/article/75265827")).toBe(true);
    expect(crawler.matches("https://bbs-api.miyoushe.com/test")).toBe(true);
  });
  it("rejects other domains", () => {
    expect(crawler.matches("https://example.com")).toBe(false);
  });

  // ── post_detail ──

  it("post_detail: fails with empty post_id", async () => {
    const r = await crawler.collectUnits(["miyoushe_post_detail"], {});
    expect(r[0].status).toBe("failed");
    expect(r[0].error).toContain("缺少 post_id");
  });

  it("post_detail: returns structured data", async () => {
    (crawler as any).signedGet = async () => ({
      responseTime: 50,
      data: {
        retcode: 0,
        data: {
          post: {
            post: {
              post_id: "1",
              subject: "标题",
              content: "<p>正文</p>",
              uid: "123",
              created_at: 1000,
              view_status: 1,
              is_original: 1,
              f_forum_id: 28,
              topics: [{ name: "原神" }],
              stats: { view: 10, like: 5 },
            },
          },
        },
      },
    });
    const r = await crawler.collectUnits(["miyoushe_post_detail"], { post_id: "1" });
    expect(r[0].status).toBe("success");
    const d = r[0].data as any;
    expect(d.subject).toBe("标题");
    expect(d.stats.view).toBe(10);
  });

  // ── user_info ──

  it("user_info: fails with empty uid", async () => {
    const r = await crawler.collectUnits(["miyoushe_user_info"], {});
    expect(r[0].status).toBe("failed");
    expect(r[0].error).toContain("缺少 uid");
  });

  it("user_info: returns user data", async () => {
    (crawler as any).signedGet = async () => ({
      responseTime: 50,
      data: {
        retcode: 0,
        data: {
          user_info: {
            uid: "456",
            nickname: "测试用户",
            introduce: "简介",
            avatar_url: "https://avatar.com/a.png",
            gender: 1,
            level_exp: { level: 5, exp: 100 },
            achieve: { like_num: "100", post_num: "5", replypost_num: "20", follow_cnt: "10", followed_cnt: "8" },
            community_info: { is_realname: true },
            ip_region: "广东",
          },
        },
      },
    });
    const r = await crawler.collectUnits(["miyoushe_user_info"], { uid: "456" });
    expect(r[0].status).toBe("success");
    const d = r[0].data as any;
    expect(d.nickname).toBe("测试用户");
    expect(d.level).toBe(5);
    expect(d.like_num).toBe(100);
  });

  // ── post_comments ──

  it("post_comments: fails with empty post_id", async () => {
    const r = await crawler.collectUnits(["miyoushe_post_comments"], {});
    expect(r[0].status).toBe("failed");
    expect(r[0].error).toContain("缺少 post_id");
  });

  it("post_comments: returns comment list", async () => {
    (crawler as any).signedGet = async () => ({
      responseTime: 50,
      data: {
        retcode: 0,
        data: {
          list: [
            {
              reply: {
                reply_id: "r1",
                uid: "u1",
                content: "评论内容",
                like_count: 5,
                created_at: 2000,
                sub_reply_count: 2,
                user: { nickname: "评论者" },
              },
            },
          ],
        },
      },
    });
    const r = await crawler.collectUnits(["miyoushe_post_comments"], { post_id: "1" });
    expect(r[0].status).toBe("success");
    const d = r[0].data as any[];
    expect(d.length).toBe(1);
    expect(d[0].nickname).toBe("评论者");
    expect(d[0].like_count).toBe(5);
  });

  // ── search_posts ──

  it("search_posts: fails with empty keyword", async () => {
    const r = await crawler.collectUnits(["miyoushe_search_posts"], {});
    expect(r[0].status).toBe("failed");
    expect(r[0].error).toContain("缺少 keyword");
  });

  it("search_posts: returns search results", async () => {
    (crawler as any).signedGet = async () => ({
      responseTime: 50,
      data: {
        retcode: 0,
        data: {
          list: [
            {
              post: { post_id: "p1", subject: "搜索结果", uid: "u1", created_at: 3000, view_status: 1, stat: { reply_count: 3, like_count: 10 } },
              user: { nickname: "作者" },
              forum: { name: "原神" },
            },
          ],
        },
      },
    });
    const r = await crawler.collectUnits(["miyoushe_search_posts"], { keyword: "原神" });
    expect(r[0].status).toBe("success");
    const d = r[0].data as any[];
    expect(d.length).toBe(1);
    expect(d[0].subject).toBe("搜索结果");
    expect(d[0].forum_name).toBe("原神");
  });

  // ── API error ──

  it("handles API error retcode", async () => {
    (crawler as any).signedGet = async () => ({ responseTime: 50, data: { retcode: 10001, message: "错误" } });
    const r = await crawler.collectUnits(["miyoushe_post_detail"], { post_id: "1" });
    expect(r[0].status).toBe("partial");
    expect(r[0].error).toContain("retcode=10001");
  });
});
