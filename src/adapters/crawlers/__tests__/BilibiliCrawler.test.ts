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
