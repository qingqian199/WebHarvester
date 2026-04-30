import { CrawlerDispatcher } from "../CrawlerDispatcher";
import { ISiteCrawler, PageData } from "../../ports/ISiteCrawler";

function stubCrawler(name: string, domain: string, willMatch: boolean): ISiteCrawler {
  return {
    name,
    domain,
    matches: (_url: string) => willMatch,
    fetch: jest.fn().mockImplementation(async (url: string) => ({
      url, statusCode: 200, body: "ok", headers: {},
      responseTime: 10, capturedAt: new Date().toISOString(),
    } as PageData)),
  };
}

describe("CrawlerDispatcher", () => {
  let d: CrawlerDispatcher;

  beforeEach(() => {
    d = new CrawlerDispatcher();
  });

  afterEach(() => {
    d.clear();
  });

  it("returns null when no crawlers registered", () => {
    expect(d.dispatch("https://example.com")).toBeNull();
  });

  it("returns null when no crawler matches", () => {
    d.register(stubCrawler("a", "a.com", false));
    expect(d.dispatch("https://example.com")).toBeNull();
  });

  it("returns matching crawler", () => {
    const c = stubCrawler("xhs", "xiaohongshu.com", true);
    d.register(c);
    expect(d.dispatch("https://www.xiaohongshu.com/explore")).toBe(c);
  });

  it("returns first matching crawler when multiple registered", () => {
    const c1 = stubCrawler("first", "first.com", true);
    const c2 = stubCrawler("second", "second.com", true);
    d.register(c1);
    d.register(c2);
    expect(d.dispatch("https://first.com/page")).toBe(c1);
  });

  it("skips non-matching crawlers before matching one", () => {
    const c1 = stubCrawler("skip", "skip.com", false);
    const c2 = stubCrawler("match", "match.com", true);
    d.register(c1);
    d.register(c2);
    expect(d.dispatch("https://match.com/page")).toBe(c2);
  });

  it("fetch returns null when no crawler matches", async () => {
    const result = await d.fetch("https://example.com");
    expect(result).toBeNull();
  });

  it("fetch returns PageData when crawler matches", async () => {
    d.register(stubCrawler("xhs", "xhs.com", true));
    const result = await d.fetch("https://www.xiaohongshu.com/explore");
    expect(result).not.toBeNull();
    expect(result!.statusCode).toBe(200);
  });

  it("list returns registered crawlers", () => {
    const c = stubCrawler("xhs", "xhs.com", true);
    d.register(c);
    expect(d.list).toHaveLength(1);
    expect(d.list[0].name).toBe("xhs");
  });

  it("clear removes all crawlers", () => {
    d.register(stubCrawler("xhs", "xhs.com", true));
    d.clear();
    expect(d.list).toHaveLength(0);
    expect(d.dispatch("https://xhs.com")).toBeNull();
  });
});
