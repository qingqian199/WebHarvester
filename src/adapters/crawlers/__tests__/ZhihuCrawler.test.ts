import { ZhihuCrawler, ZhihuApiEndpoints } from "../ZhihuCrawler";

describe("ZhihuCrawler", () => {
  const crawler = new ZhihuCrawler();

  describe("matches", () => {
    it("matches zhihu.com URLs", () => {
      expect(crawler.matches("https://www.zhihu.com/question/1")).toBe(true);
      expect(crawler.matches("https://zhuanlan.zhihu.com/p/123")).toBe(true);
    });

    it("does not match other domains", () => {
      expect(crawler.matches("https://example.com")).toBe(false);
      expect(crawler.matches("https://bilibili.com")).toBe(false);
    });

    it("returns false for invalid URL", () => {
      expect(crawler.matches("not a url")).toBe(false);
    });
  });

  describe("ZhihuApiEndpoints", () => {
    it("has at least 3 endpoints defined", () => {
      expect(ZhihuApiEndpoints.length).toBeGreaterThanOrEqual(3);
    });

    it("each endpoint has name and path", () => {
      ZhihuApiEndpoints.forEach((ep) => {
        expect(ep.name).toBeTruthy();
        expect(ep.path).toBeTruthy();
        expect(ep.path).toContain("/api/");
      });
    });
  });

  describe("fetchApi", () => {
    it("throws for unknown endpoint", async () => {
      await expect(crawler.fetchApi("不存在的端点", {})).rejects.toThrow("未知端点");
    });

    it("resolves endpoint by name", async () => {
      const ep = ZhihuApiEndpoints[0];
      const result = await crawler.fetchApi(ep.name, {});
      expect(result.statusCode).toBeDefined();
    });
  });
});
