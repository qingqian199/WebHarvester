import { BaseCrawler } from "../BaseCrawler";

class TestCrawler extends BaseCrawler {
  readonly name = "test";
  readonly domain = "test.com";
  constructor() { super("test"); }
  matches(url: string): boolean { return url.includes("test.com"); }
}

describe("BaseCrawler data quality helpers", () => {
  let c: TestCrawler;

  beforeEach(() => {
    c = new TestCrawler();
  });

  describe("dedupComments", () => {
    it("removes duplicate comments by rpid + content + author", () => {
      const items = [
        { rpid: 1, content: { message: "hello" }, member: { uname: "user1" } },
        { rpid: 1, content: { message: "hello" }, member: { uname: "user1" } },
        { rpid: 2, content: { message: "world" }, member: { uname: "user2" } },
      ];
      const { data, deduped_count } = c["dedupComments"](items);
      expect(data).toHaveLength(2);
      expect(deduped_count).toBe(1);
      expect(data[0].rpid).toBe(1);
      expect(data[1].rpid).toBe(2);
    });

    it("preserves unique comments", () => {
      const items = [
        { rpid: 1, content: { message: "a" }, member: { uname: "u1" } },
        { rpid: 2, content: { message: "b" }, member: { uname: "u2" } },
      ];
      const { data, deduped_count } = c["dedupComments"](items);
      expect(data).toHaveLength(2);
      expect(deduped_count).toBe(0);
    });

    it("handles empty input", () => {
      const { data, deduped_count } = c["dedupComments"]([]);
      expect(data).toEqual([]);
      expect(deduped_count).toBe(0);
    });
  });

  describe("fmtTime", () => {
    it("converts Unix seconds to ISO string", () => {
      const result = c["fmtTime"](1714567890);
      expect(result).toMatch(/^2024-05-01/);
    });

    it("converts Unix milliseconds to ISO string", () => {
      const result = c["fmtTime"](1714567890000);
      expect(result).toMatch(/^2024-05-01/);
    });

    it("returns undefined for null/undefined", () => {
      expect(c["fmtTime"](null)).toBeUndefined();
      expect(c["fmtTime"](undefined)).toBeUndefined();
    });
  });

  describe("safeNum", () => {
    it("converts string numbers to number", () => {
      expect(c["safeNum"]("123")).toBe(123);
    });
    it("returns default for NaN", () => {
      expect(c["safeNum"]("abc")).toBe(0);
    });
    it("returns default for null/undefined", () => {
      expect(c["safeNum"](null)).toBe(0);
      expect(c["safeNum"](undefined)).toBe(0);
    });
  });
});
