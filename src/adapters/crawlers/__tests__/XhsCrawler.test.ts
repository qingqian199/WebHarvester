import { XhsCrawler, buildXsCommon } from "../XhsCrawler";

describe("XhsCrawler", () => {
  const crawler = new XhsCrawler();

  describe("matches", () => {
    it("matches xiaohongshu.com URLs", () => {
      expect(crawler.matches("https://www.xiaohongshu.com/explore")).toBe(true);
      expect(crawler.matches("https://xiaohongshu.com/discovery")).toBe(true);
      expect(crawler.matches("https://www.xiaohongshu.com/search_result?keyword=test")).toBe(true);
    });

    it("does not match other domains", () => {
      expect(crawler.matches("https://example.com")).toBe(false);
      expect(crawler.matches("https://bilibili.com")).toBe(false);
      expect(crawler.matches("https://zhihu.com")).toBe(false);
    });

    it("returns false for invalid URL", () => {
      expect(crawler.matches("not a url")).toBe(false);
    });
  });

  describe("buildXsCommon", () => {
    it("returns a non-empty string", () => {
      const result = buildXsCommon("Mozilla/5.0 Chrome/124", "Win32");
      expect(result).toBeTruthy();
      expect(result.length).toBeGreaterThan(10);
    });

    it("returns base64-encoded JSON with platform info", () => {
      const result = buildXsCommon("Mozilla/5.0 Chrome/124", "Win32");
      const decoded = Buffer.from(result, "base64").toString("utf-8");
      const parsed = JSON.parse(decoded);
      expect(parsed.x2).toBe("Windows");
      expect(parsed.x3).toBe("xhs-pc-web");
    });
  });

  describe("buildXsCommon", () => {
    it("returns a non-empty string", () => {
      const result = buildXsCommon("Mozilla/5.0 Chrome/124", "Win32");
      expect(result).toBeTruthy();
    });
  });
});
