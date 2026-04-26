import { IBrowserFingerprint } from "../core/ports/IBrowserFingerprint";

const USER_AGENT_POOL = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 Safari/17.4",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/123.0.0.0 Safari/537.36"
];

const VIEWPORT_POOL = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 }
];

export class RealisticFingerprintProvider {
  getFingerprint(): IBrowserFingerprint {
    const ua = USER_AGENT_POOL[Math.floor(Math.random() * USER_AGENT_POOL.length)];
    const vp = VIEWPORT_POOL[Math.floor(Math.random() * VIEWPORT_POOL.length)];

    let platform = "Win32";
    if (ua.includes("Mac")) platform = "MacIntel";
    if (ua.includes("Linux")) platform = "Linux x86_64";

    return {
      userAgent: ua,
      viewport: vp,
      platform,
      locale: "zh-CN",
      acceptLanguage: "zh-CN,zh;q=0.9,en;q=0.8"
    };
  }
}