import { signWbi, buildSignedQuery } from "../../../utils/crypto/bilibili-signer";
import { BilibiliCrawler, BiliApiEndpoints } from "../BilibiliCrawler";

describe("signWbi", () => {
  it("returns w_rid and wts", () => {
    const result = signWbi({ aid: "123" }, "img_key", "sub_key");
    expect(result.w_rid).toBeTruthy();
    expect(result.w_rid.length).toBe(32); // MD5 hex
    expect(result.wts).toMatch(/^\d+$/);
  });

  it("same inputs produce same output", () => {
    const a = signWbi({ aid: "1" }, "k1", "k2");
    const b = signWbi({ aid: "1" }, "k1", "k2");
    expect(a.w_rid).toBe(b.w_rid);
  });

  it("different keys produce different signatures", () => {
    const a = signWbi({ aid: "1" }, "k1", "k2");
    const b = signWbi({ aid: "1" }, "k3", "k4");
    expect(a.w_rid).not.toBe(b.w_rid);
  });
});

describe("buildSignedQuery", () => {
  it("includes w_rid and wts in output", () => {
    const q = buildSignedQuery({ aid: "123" }, "ik", "sk");
    expect(q).toContain("w_rid=");
    expect(q).toContain("wts=");
  });
});

describe("BilibiliCrawler", () => {
  const c = new BilibiliCrawler();

  it("matches bilibili.com URLs", () => {
    expect(c.matches("https://www.bilibili.com/video/BV1test")).toBe(true);
    expect(c.matches("https://api.bilibili.com/x/web-interface/view")).toBe(true);
  });

  it("does not match other domains", () => {
    expect(c.matches("https://example.com")).toBe(false);
  });

  it("BiliApiEndpoints has at least 3 endpoints", () => {
    expect(BiliApiEndpoints.length).toBeGreaterThanOrEqual(3);
  });

  it("fetchApi throws for unknown endpoint", async () => {
    await expect(c.fetchApi("不存在的端点", {})).rejects.toThrow("未知端点");
  });
});

describe("runWithConcurrency", () => {
  it("limits concurrent execution to concurrency count", async () => {
    const c = new BilibiliCrawler();
    let concurrent = 0;
    let maxConcurrent = 0;
    const fn = async (x: number) => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 10));
      concurrent--;
      return x * 2;
    };
    const results = await c["runWithConcurrency"]([1, 2, 3, 4, 5, 6], 3, fn);
    expect(maxConcurrent).toBeLessThanOrEqual(3);
    expect([...results].sort((a, b) => a - b)).toEqual([2, 4, 6, 8, 10, 12]);
  });

  it("works with single item", async () => {
    const c = new BilibiliCrawler();
    const r = await c["runWithConcurrency"](["a"], 3, async (x) => x.toUpperCase());
    expect(r).toEqual(["A"]);
  });

  it("works with empty input", async () => {
    const c = new BilibiliCrawler();
    const r = await c["runWithConcurrency"]([], 3, async (x) => x);
    expect(r).toEqual([]);
  });
});

describe("bili_video_sub_replies auto-traverse", () => {
  it("fails when bili_video_comments is not in results", async () => {
    const c = new BilibiliCrawler();
    const results = await c.collectUnits(["bili_video_sub_replies"], { aid: "123", oid: "123" });
    expect(results[0].status).toBe("failed");
    expect(results[0].error).toContain("自动展开子回复需要先勾选");
  });

  it("fails when oid is missing", async () => {
    const c = new BilibiliCrawler();
    const results = await c.collectUnits(["bili_video_sub_replies"], {});
    expect(results[0].status).toBe("failed");
    expect(results[0].error).toContain("缺少 oid");
  });
});
