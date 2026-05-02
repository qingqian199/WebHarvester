import { signTtRequestV2, isSignatureServerReady } from "../tiktok-signer-v2";

describe("signTtRequestV2", () => {
  it("returns X-Bogus when server is available", async () => {
    // Skip if server not running
    const ready = await isSignatureServerReady();
    if (!ready) {
      console.warn("⚠️ tiktok-signature server not running, skipping v2 test");
      return;
    }
    const result = await signTtRequestV2(
      "https://www.tiktok.com/api/recommend/item_list/?aid=1988&count=1",
      "GET",
      undefined,
      { "User-Agent": "Mozilla/5.0 Chrome/125.0.0.0 Safari/537.36", "Cookie": "ttwid=test" },
    );
    expect(result["X-Bogus"]).toBeTruthy();
    expect(result["X-Bogus"]!.length).toBeGreaterThan(10);
  }, 20000);

  it("returns X-Gnarly alongside X-Bogus", async () => {
    const ready = await isSignatureServerReady();
    if (!ready) return;
    const result = await signTtRequestV2(
      "https://www.tiktok.com/api/recommend/item_list/?aid=1988&count=1",
      "GET",
      undefined,
      { "User-Agent": "Mozilla/5.0 Chrome/125.0.0.0 Safari/537.36" },
    );
    expect(result["X-Gnarly"]).toBeTruthy();
  }, 20000);

  it("gracefully falls back when server is unavailable", async () => {
    const result = await signTtRequestV2(
      "https://www.tiktok.com/api/test",
      "GET",
      undefined,
      { "User-Agent": "Mozilla/5.0 Chrome/125.0.0.0 Safari/537.36", ttwid: "test123" },
    );
    // Should fall back to v1 (ts, device_id, sign) or return empty
    expect(result.ts || result["X-Bogus"]).toBeTruthy();
  }, 5000);
});
