import { signTtRequest } from "../tiktok-signer";

describe("signTtRequest", () => {
  it("returns ts, device_id, and sign fields", () => {
    const result = signTtRequest({ url: "https://www.tiktok.com/api/test", method: "GET" });
    expect(result.ts).toMatch(/^\d+$/);
    expect(result.device_id).toBeDefined();
    expect(result.sign).toMatch(/^[a-f0-9]{16}$/);
  });

  it("includes ttwid in signing", () => {
    const withId = signTtRequest({ url: "https://www.tiktok.com/api/test", method: "GET", ttwid: "device123" });
    const withoutId = signTtRequest({ url: "https://www.tiktok.com/api/test", method: "GET" });
    expect(withId.sign).not.toBe(withoutId.sign);
  });

  it("produces consistent output for same inputs", () => {
    const a = signTtRequest({ url: "https://www.tiktok.com/api/test", method: "POST", data: "body", ttwid: "id", userAgent: "Mozilla" });
    const b = signTtRequest({ url: "https://www.tiktok.com/api/test", method: "POST", data: "body", ttwid: "id", userAgent: "Mozilla" });
    expect(a.sign).toBe(b.sign);
  });
});
