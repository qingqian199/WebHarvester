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

    it("includes platform in output", () => {
      const result = buildXsCommon("Mozilla/5.0 Chrome/124", "Win32");
      expect(result).toContain("Win32");
    });
  });

  describe("buildXsCommon", () => {
    it("returns a non-empty string", () => {
      const result = buildXsCommon("Mozilla/5.0 Chrome/124", "Win32");
      expect(result).toBeTruthy();
    });
  });
});
