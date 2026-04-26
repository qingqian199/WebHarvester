/**
 * 硬件适配功能总开关
 */
export const FeatureFlags = {
  // 重型解耦模块（低配默认关闭）
  enableParallelTask: false,
  enableBrowserPool: false,
  enableAdvancedFingerprint: false,
  enableProxyPool: false,
  enableDaemonMode: false,
  enableCronTask: false,
  enableDatabase: false,
  enableLongTermCache: false,
  enableAdaptiveStrategy: false,
  enableActionRecorder: false,
  enableMultiStorage: false,

  // 基础必需（默认开启）
  enableSessionPersist: true,
  enableHarExport: true,
  enableDynamicFingerprint: true,

  // 差异化能力
  enableAiCompactMode: true,
  enableSecurityAudit: true
};
