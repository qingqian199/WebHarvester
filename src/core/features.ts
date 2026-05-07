export interface FeatureFlagSet {
  // ── 已实现功能 ──
  enableSessionPersist: boolean;
  enableHarExport: boolean;
  enableDynamicFingerprint: boolean;
  enableAiCompactMode: boolean;
  enableSecurityAudit: boolean;
  enableAntiCrawlTagging: boolean;
  enableStubGeneration: boolean;

  // 已实现 — 默认关闭，用户 opt-in
  enableProxyPool: boolean;
  enableFullCaptureMode: boolean;
  enableFullCaptureEnhanced: boolean;
  /** ChromeService CDP 直连模式 */
  enableChromeService: boolean;
  /** 将浏览器令牌/签名服务分离到独立后端进程 */
  enableBackendService: boolean;
  /** @deprecated Not yet implemented, must be false */
  enableDaemonProcess: boolean;
  [key: string]: boolean;
}

export const DEFAULT_FEATURE_FLAGS: FeatureFlagSet = {
  // 已实现 — 默认启用
  enableSessionPersist: true,
  enableHarExport: true,
  enableDynamicFingerprint: true,
  enableAiCompactMode: true,
  enableSecurityAudit: true,
  enableAntiCrawlTagging: true,
  enableStubGeneration: true,

  enableBackendService: false,
  // 未实现 — 必须保持 false
  enableParallelTask: false,
  enableBrowserPool: false,
  enableDaemonProcess: false,
  // 已实现 — 默认关闭，用户 opt-in
  enableProxyPool: false,
  enableFullCaptureMode: false,
  enableFullCaptureEnhanced: false,
  enableChromeService: false,
};

export const FeatureFlags: FeatureFlagSet = { ...DEFAULT_FEATURE_FLAGS };

/** 从 AppConfig 加载 FeatureFlags，覆盖默认值。 */
export function applyFeatureFlags(cfg: Partial<FeatureFlagSet>): void {
  for (const key of Object.keys(DEFAULT_FEATURE_FLAGS)) {
    if (key in cfg && typeof cfg[key] === "boolean") {
      FeatureFlags[key] = cfg[key]!;
    }
  }
  // 强制未实现开关为 false
  for (const depKey of ["enableParallelTask", "enableBrowserPool", "enableDaemonProcess"] as const) {
    if (FeatureFlags[depKey]) {
      process.stderr.write(`⚠️ Feature flag "${depKey}" is not yet implemented, forcing to false\n`);
      FeatureFlags[depKey] = false;
    }
  }
}
