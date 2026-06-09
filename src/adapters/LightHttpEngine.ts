import { ILightHttpEngine, LightHttpResult } from "../core/ports/ILightHttpEngine";
import { RealisticFingerprintProvider } from "./RealisticFingerprintProvider";

export class LightHttpEngine implements ILightHttpEngine {
  private readonly fp = new RealisticFingerprintProvider();

  async fetch(url: string): Promise<LightHttpResult> {
    const start = Date.now();
    const fpInfo = this.fp.getFingerprint();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": fpInfo.userAgent,
          "Accept-Language": fpInfo.acceptLanguage,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Cache-Control": "no-cache",
        },
        signal: controller.signal,
        redirect: "follow",
      });
      const html = await res.text();
      const cost = Date.now() - start;

      return {
        html,
        statusCode: res.status,
        headers: Object.fromEntries(res.headers),
        finalUrl: res.url,
        responseTime: cost,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
