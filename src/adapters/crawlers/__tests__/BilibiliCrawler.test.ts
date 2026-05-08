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

  it("matches HAR capture: player/wbi/v2 endpoint", () => {
    // 验证 WBI 签名算法与 B站前端一致。
    // 注意：WBI 签名包含所有请求参数（含 dm_img_* 追踪参数），
    // BilibiliCrawler 不生成 dm_img_* 参数，但核心算法一致。
    const imgKey = "7cd084941338484aae1ad9425b84077c";
    const subKey = "4932caff0ff746eab6f01bf08b70ac45";
    const params = {
      aid: "116535213427484",
      cid: "38171643280",
      dm_cover_img_str: "QU5HTEUgKE5WSURJQSwgTlZJRElBIEdlRm9yY2UgUlRYIDUwNjAgTGFwdG9wIEdQVSAoMHgwMDAwMkQ1OSkgRGlyZWN0M0QxMSB2c181XzAgcHNfNV8wLCBEM0QxMSlHb29nbGUgSW5jLiAoTlZJRElBKQ",
      dm_img_inter: "{\"ds\":[],\"wh\":[3850,4515,44],\"of\":[362,724,362]}",
      dm_img_list: "[]",
      dm_img_str: "V2ViR0wgMS4wIChPcGVuR0wgRVMgMi4wIENocm9taXVtKQ",
      isGaiaAvoided: "false",
      web_location: "1315873",
    };
    const result = signWbi(params, imgKey, subKey, "1778242694");
    expect(result.w_rid).toBe("f0689d5972caaf62f0bb889596fb1323");
  });

  it("matches HAR capture: view/detail endpoint", () => {
    const imgKey = "7cd084941338484aae1ad9425b84077c";
    const subKey = "4932caff0ff746eab6f01bf08b70ac45";
    const params = {
      aid: "116535213427484",
      dm_cover_img_str: "QU5HTEUgKE5WSURJQSwgTlZJRElBIEdlRm9yY2UgUlRYIDUwNjAgTGFwdG9wIEdQVSAoMHgwMDAwMkQ1OSkgRGlyZWN0M0QxMSB2c181XzAgcHNfNV8wLCBEM0QxMSlHb29nbGUgSW5jLiAoTlZJRElBKQ",
      dm_img_inter: "{\"ds\":[{\"t\":2,\"c\":\"YnB4LXBsYXllci12aWRlby1pbnB1dGJhci13cm\",\"p\":[2090,68,1880],\"s\":[48,1021,1180]},{\"t\":2,\"c\":\"YnB4LXBsYXllci1kbS1idG4tc2VuZCBidWkgYnVpLWJ1dHRvbg\",\"p\":[2678,62,1571],\"s\":[153,403,426]}],\"wh\":[3982,4559,88],\"of\":[177,354,177]}",
      dm_img_list: "[]",
      dm_img_str: "V2ViR0wgMS4wIChPcGVuR0wgRVMgMi4wIENocm9taXVtKQ",
      isGaiaAvoided: "false",
      need_view: "1",
      web_location: "1315873",
    };
    const result = signWbi(params, imgKey, subKey, "1778242697");
    expect(result.w_rid).toBe("7679cff7a3c24055fedc88236b9e82e4");
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
