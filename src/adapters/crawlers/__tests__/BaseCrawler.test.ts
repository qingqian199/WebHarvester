import { BaseCrawler } from "../BaseCrawler";

class TestCrawler extends BaseCrawler {
  readonly name = "test";
  readonly domain = "example.com";
  matches(_url: string): boolean { return false; }
  collectUnits(): Promise<any> { return Promise.resolve([]); }
}

function createCrawler(): TestCrawler {
  return new TestCrawler();
}

function callShuffleArray(c: TestCrawler, arr: number[]): number[] {
  return (c as any).shuffleArray(arr);
}

describe("shuffleArray", () => {
  it("returns array of same length", () => {
    const c = createCrawler();
    const input = [1, 2, 3, 4, 5];
    const result = callShuffleArray(c, input);
    expect(result).toHaveLength(5);
  });

  it("contains all original elements", () => {
    const c = createCrawler();
    const input = [1, 2, 3, 4, 5];
    const result = callShuffleArray(c, input).sort();
    expect(result).toEqual([1, 2, 3, 4, 5]);
  });

  it("does not mutate original array", () => {
    const c = createCrawler();
    const input = [1, 2, 3, 4, 5];
    const original = [...input];
    callShuffleArray(c, input);
    expect(input).toEqual(original);
  });

  it("handles empty array", () => {
    const c = createCrawler();
    expect(callShuffleArray(c, [])).toEqual([]);
  });

  it("handles single element", () => {
    const c = createCrawler();
    expect(callShuffleArray(c, [42])).toEqual([42]);
  });

  it("produces different orderings (probabilistic)", () => {
    const c = createCrawler();
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const results = new Set<string>();
    for (let i = 0; i < 10; i++) {
      results.add(callShuffleArray(c, input).join(","));
    }
    expect(results.size).toBeGreaterThan(1);
  });
});

function callTraverseSubReplies(c: TestCrawler, items: any[], opts: any): Promise<any> {
  return (c as any).traverseSubReplies(items, opts);
}

describe("traverseSubReplies", () => {
  it("returns empty result when rootItems is empty", async () => {
    const c = createCrawler();
    const result = await callTraverseSubReplies(c, [], { rootIdExtractor: (r: any) => r.id, fetchPage: jest.fn() });
    expect(result.byRpid).toEqual({});
    expect(result.totalReplies).toBe(0);
    expect(result.totalTime).toBe(0);
  });

  it("fetches single rpid sub-replies with pagination", async () => {
    const c = createCrawler();
    const fetchPage = jest
      .fn()
      .mockResolvedValueOnce({ replies: ["r1", "r2"], hasMore: true, nextCursor: "c1", responseTime: 50 })
      .mockResolvedValueOnce({ replies: ["r3"], hasMore: false, nextCursor: "", responseTime: 30 });
    const result = await callTraverseSubReplies(c, [{ id: "root1" }], {
      rootIdExtractor: (r: any) => r.id,
      maxPages: 5,
      staggerMs: 1,
      fetchPage,
    });
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(fetchPage).toHaveBeenNthCalledWith(1, "root1", 0);
    expect(fetchPage).toHaveBeenNthCalledWith(2, "root1", "c1");
    expect(result.byRpid["root1"].replies).toEqual(["r1", "r2", "r3"]);
    expect(result.totalReplies).toBe(3);
    expect(result.expandedCount).toBe(1);
    expect(result.totalTime).toBe(80);
  });

  it("handles multiple rpids concurrently", async () => {
    const c = createCrawler();
      const fetchPage = jest.fn().mockImplementation(async (rootId: string) => {
      await new Promise((r) => setTimeout(r, 1));
      return { replies: [`reply_to_${rootId}`], hasMore: false, nextCursor: "", responseTime: 10 };
    });
    const result = await callTraverseSubReplies(c, [{ id: "a" }, { id: "b" }], {
      rootIdExtractor: (r: any) => r.id,
      maxPages: 5,
      concurrency: 3,
      staggerMs: 1,
      fetchPage,
    });
    expect(result.byRpid["a"].replies).toEqual(["reply_to_a"]);
    expect(result.byRpid["b"].replies).toEqual(["reply_to_b"]);
    expect(result.totalReplies).toBe(2);
    expect(result.expandedCount).toBe(2);
  });

  it("single rpid failure does not interrupt others", async () => {
    const c = createCrawler();
    const fetchPage = jest
      .fn()
      .mockResolvedValueOnce({ replies: ["ok1"], hasMore: false, nextCursor: "", responseTime: 10 })
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockResolvedValueOnce({ replies: ["ok2"], hasMore: false, nextCursor: "", responseTime: 10 });
    const result = await callTraverseSubReplies(c, [{ id: "good1" }, { id: "bad" }, { id: "good2" }], {
      rootIdExtractor: (r: any) => r.id,
      maxPages: 5,
      concurrency: 3,
      staggerMs: 1,
      fetchPage,
    });
    expect(result.byRpid["good1"]).toBeDefined();
    expect(result.byRpid["good2"]).toBeDefined();
    expect(result.byRpid["bad"]).toBeUndefined();
    expect(result.expandedCount).toBe(2);
    expect(result.failedCount).toBe(1);
  });

  it("applies postProcess callback when provided", async () => {
    const c = createCrawler();
    const postProcess = jest.fn().mockReturnValue({ replies: ["processed"] });
    const fetchPage = jest.fn().mockResolvedValue({ replies: ["raw"], hasMore: false, nextCursor: "", responseTime: 10 });
    const result = await callTraverseSubReplies(c, [{ id: "root1" }], {
      rootIdExtractor: (r: any) => r.id,
      maxPages: 5,
      staggerMs: 1,
      fetchPage,
      postProcess,
    });
    expect(postProcess).toHaveBeenCalledWith(["raw"], "root1");
    expect(result.byRpid["root1"].replies).toEqual(["processed"]);
  });
});
