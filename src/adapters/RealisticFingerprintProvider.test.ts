import { RealisticFingerprintProvider } from "./RealisticFingerprintProvider";

describe("RealisticFingerprintProvider", () => {
  const provider = new RealisticFingerprintProvider();

  it("returns a fingerprint with all required fields", () => {
    const fp = provider.getFingerprint();
    expect(fp.userAgent).toBeTruthy();
    expect(fp.viewport).toBeDefined();
    expect(fp.viewport.width).toBeGreaterThan(0);
    expect(fp.viewport.height).toBeGreaterThan(0);
    expect(fp.platform).toBeTruthy();
    expect(fp.locale).toBeTruthy();
    expect(fp.acceptLanguage).toBeTruthy();
  });

  it("always returns zh-CN locale", () => {
    for (let i = 0; i < 20; i++) {
      expect(provider.getFingerprint().locale).toBe("zh-CN");
    }
  });

  it("returns different user agents across multiple calls", () => {
    const agents = new Set<string>();
    for (let i = 0; i < 50; i++) {
      agents.add(provider.getFingerprint().userAgent);
    }
    // Should have at least 2 different UAs
    expect(agents.size).toBeGreaterThanOrEqual(2);
  });

  it("sets platform based on user agent", () => {
    const fps = Array.from({ length: 50 }, () => provider.getFingerprint());
    const hasWin32 = fps.some((f) => f.platform === "Win32");
    const hasMacIntel = fps.some((f) => f.platform === "MacIntel");
    expect(hasWin32 || hasMacIntel).toBe(true);
  });

  it("viewport width is always 1920, 1440, or 1366", () => {
    for (let i = 0; i < 20; i++) {
      const w = provider.getFingerprint().viewport.width;
      expect([1920, 1440, 1366]).toContain(w);
    }
  });
});
