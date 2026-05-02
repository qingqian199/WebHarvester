import { formatUnitResult, formatUnitResults } from "./formatter";

describe("formatUnitResult", () => {
  describe("bili_video_info", () => {
    it("formats video detail with stats", () => {
      const data = { code: 0, data: {
        title: "测试视频标题",
        desc: "视频简介内容",
        pubdate: 1700000000,
        duration: 367,
        owner: { name: "UP主名", mid: 12345 },
        stat: { view: 100000, like: 5000, coin: 800, favorite: 2000, share: 300 },
        tname: "知识",
      } };
      const r = formatUnitResult("bili_video_info", data);
      expect(r.title).toBe("测试视频标题");
      expect(r.summary).toContain("10.0万播放");
      expect(r.fields.some((f) => f.label === "UP主" && f.value === "UP主名")).toBe(true);
      expect(r.fields.some((f) => f.label === "播放" && f.value === "10.0万")).toBe(true);
      expect(r.fields.some((f) => f.label === "时长" && f.value === "6:07")).toBe(true);
    });

    it("formats video detail with View wrapper (actual Bilibili API shape)", () => {
      const data = { code: 0, data: {
        View: {
          title: "B站全量实测视频",
          desc: "这是一段测试简介",
          pubdate: 1700000000,
          duration: 245,
          owner: { name: "测试UP", mid: 67890 },
          stat: { view: 99999, like: 3000, coin: 200, favorite: 1000, share: 150 },
          tname: "科技",
        },
      } };
      const r = formatUnitResult("bili_video_info", data);
      expect(r.title).toBe("B站全量实测视频");
      expect(r.summary).toContain("10.0万播放");
      expect(r.fields.some((f) => f.label === "UP主" && f.value === "测试UP")).toBe(true);
      expect(r.fields.some((f) => f.label === "播放" && f.value === "10.0万")).toBe(true);
      expect(r.fields.some((f) => f.label === "简介")).toBe(true);
    });

    it("handles missing stat gracefully", () => {
      const r = formatUnitResult("bili_video_info", { data: { title: "无数据" } });
      expect(r.title).toBe("无数据");
      expect(r.fields.some((f) => f.label === "播放" && f.value === "0")).toBe(true);
    });
  });

  describe("bili_video_comments", () => {
    it("formats comment list", () => {
      const data = { code: 0, data: {
        replies: [
          { rpid: 1, member: { uname: "用户A" }, content: { message: "好视频！" }, like: 100, ctime: 1700000000 },
          { rpid: 2, member: { uname: "用户B" }, content: { message: "学到了" }, like: 10, ctime: 1700000100 },
        ],
        cursor: { all_count: 2 },
      } };
      const r = formatUnitResult("bili_video_comments", data);
      expect(r.title).toContain("2 条");
      expect(r.details).toContain("用户A");
      expect(r.details).toContain("好视频！");
      expect(r.details).toContain("用户B");
    });

    it("handles empty comments", () => {
      const r = formatUnitResult("bili_video_comments", { data: { replies: [], cursor: {} } });
      expect(r.details).toContain("暂无评论");
    });
  });

  describe("bili_video_sub_replies", () => {
    it("formats grouped sub-replies", () => {
      const data = { code: 0, data: {
        comments: {
          "100": { replies: [
            { member: { uname: "回复A" }, content: { message: "回复内容" }, like: 5 },
            { member: { uname: "回复B" }, content: { message: "另一条" }, like: 3 },
          ], all_count: 2 },
        },
        total_replies: 2,
        expanded_count: 1,
      } };
      const r = formatUnitResult("bili_video_sub_replies", data);
      expect(r.title).toContain("2 条");
      expect(r.details).toContain("回复A");
      expect(r.details).toContain("回复内容");
    });
  });

  describe("bili_search", () => {
    it("formats search results", () => {
      const data = { data: {
        keyword: "测试",
        numResults: 100,
        result: [
          { title: "<em>测试</em>视频1", play: 50000, author: "UP1" },
          { title: "测试视频2", play: 30000, author: "UP2" },
        ],
      } };
      const r = formatUnitResult("bili_search", data);
      expect(r.summary).toContain("100 条");
      expect(r.details).toContain("测试视频1");
      expect(r.details).toContain("UP1");
    });
  });

  describe("bili_user_videos", () => {
    it("formats video list", () => {
      const data = { data: {
        list: { vlist: [
          { title: "视频A", author: "UP主", play: 10000, comment: 50 },
          { title: "视频B", author: "UP主", play: 20000, comment: 80 },
        ], author: "UP主" },
        page: { count: 2 },
      } };
      const r = formatUnitResult("bili_user_videos", data);
      expect(r.summary).toContain("UP主");
      expect(r.summary).toContain("2 个");
      expect(r.details).toContain("视频A");
      expect(r.details).toContain("1.0万播放");
    });
  });

  describe("xiaohongshu user_info", () => {
    it("formats user info with follower count", () => {
      const data = { data: { nickname: "测试用户", follower_count: 50000, following_count: 100, liked_count: 200000 } };
      const r = formatUnitResult("user_info", data);
      expect(r.summary).toContain("测试用户");
      expect(r.summary).toContain("5.0万");
      expect(r.fields.some((f) => f.label === "获赞" && f.value === "20.0万")).toBe(true);
    });
  });

  describe("zhihu_user_info", () => {
    it("formats zhihu profile", () => {
      const data = { data: { name: "知乎用户", follower_count: 10000, answer_count: 50, headline: "个人简介" } };
      const r = formatUnitResult("zhihu_user_info", data);
      expect(r.summary).toContain("知乎用户");
      expect(r.summary).toContain("1.0万");
      expect(r.fields.some((f) => f.label === "回答数" && f.value === "50")).toBe(true);
    });
  });

  describe("zhihu_hot_search", () => {
    it("formats hot search list", () => {
      const data = { data: { hot_list: [
        { query: "热搜第一", heat: 1000000 },
        { query: "热搜第二", heat: 500000 },
      ] } };
      const r = formatUnitResult("zhihu_hot_search", data);
      expect(r.details).toContain("1. 热搜第一");
      expect(r.details).toContain("2. 热搜第二");
    });
  });

  describe("zhihu_article", () => {
    it("formats article with plain text extraction", () => {
      const data = { data: { title: "测试文章", author: { name: "作者名" }, content: "<p>文章正文内容</p>" } };
      const r = formatUnitResult("zhihu_article", data);
      expect(r.fields.some((f) => f.label === "标题")).toBe(true);
      expect(r.fields.some((f) => f.label === "作者" && f.value === "作者名")).toBe(true);
    });
  });

  describe("unknown unit", () => {
    it("falls back to raw JSON", () => {
      const r = formatUnitResult("unknown_unit", { foo: "bar" });
      expect(r.title).toBe("unknown_unit");
      expect(r.summary).toContain("foo");
    });
  });
});

describe("formatUnitResults", () => {
  it("joins multiple unit results into formatted text", () => {
    const results = [
      { unit: "bili_video_info", data: { data: { title: "视频", stat: { view: 100 } } }, status: "success", method: "signature", responseTime: 200 },
      { unit: "bili_video_comments", data: { data: { replies: [{ member: { uname: "用户" }, content: { message: "评论" }, like: 1, ctime: 1700000000 }], cursor: { all_count: 1 } } }, status: "success", method: "signature", responseTime: 300 },
    ];
    const text = formatUnitResults(results);
    expect(text).toContain("视频");
    expect(text).toContain("100播放");
    expect(text).toContain("用户");
    expect(text).toContain("评论");
    expect(text).toContain("200ms");
  });
});
