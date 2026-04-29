/** 浏览器指纹配置，用于反检测伪装。模拟真实用户的 UA、视口、语言等特征。 */
export interface IBrowserFingerprint {
  userAgent: string;
  viewport: { width: number; height: number };
  platform: string;
  locale: string;
  acceptLanguage: string;
}
