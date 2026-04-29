export interface IBrowserFingerprint {
  userAgent: string;
  viewport: { width: number; height: number };
  platform: string;
  locale: string;
  acceptLanguage: string;
}
