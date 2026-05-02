import { FeatureFlags, DEFAULT_FEATURE_FLAGS, applyFeatureFlags } from "./features";

describe("FeatureFlags", () => {
  beforeEach(() => {
    // Reset to defaults before each test
    for (const key of Object.keys(DEFAULT_FEATURE_FLAGS)) {
      FeatureFlags[key] = DEFAULT_FEATURE_FLAGS[key];
    }
  });

  it("defaults match DEFAULT_FEATURE_FLAGS", () => {
    for (const key of Object.keys(DEFAULT_FEATURE_FLAGS)) {
      expect(FeatureFlags[key]).toBe(DEFAULT_FEATURE_FLAGS[key]);
    }
  });

  it("enableSessionPersist defaults to true", () => {
    expect(FeatureFlags.enableSessionPersist).toBe(true);
  });

  it("enableParallelTask defaults to false (not implemented)", () => {
    expect(FeatureFlags.enableParallelTask).toBe(false);
  });

  it("applyFeatureFlags overrides values", () => {
    applyFeatureFlags({ enableHarExport: false, enableStubGeneration: false });
    expect(FeatureFlags.enableHarExport).toBe(false);
    expect(FeatureFlags.enableStubGeneration).toBe(false);
    expect(FeatureFlags.enableSessionPersist).toBe(true); // unchanged
  });

  it("applyFeatureFlags forces unimplemented flags to false", () => {
    applyFeatureFlags({ enableParallelTask: true, enableBrowserPool: true });
    expect(FeatureFlags.enableParallelTask).toBe(false);
    expect(FeatureFlags.enableBrowserPool).toBe(false);
  });

  it("applyFeatureFlags ignores unknown keys", () => {
    applyFeatureFlags({ unknownFlag: true } as any);
    expect((FeatureFlags as any).unknownFlag).toBeUndefined();
  });

  it("partial override only changes specified keys", () => {
    applyFeatureFlags({ enableDynamicFingerprint: false });
    expect(FeatureFlags.enableDynamicFingerprint).toBe(false);
    expect(FeatureFlags.enableAntiCrawlTagging).toBe(true); // still default
    expect(FeatureFlags.enableAiCompactMode).toBe(true);
  });
});
