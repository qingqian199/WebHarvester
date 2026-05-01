import { IBrowserFingerprint } from "../core/ports/IBrowserFingerprint";

/** 真实浏览器环境模拟请求头。与指纹结合使用，使签名直连请求看起来来自真实浏览器。 */
export function buildBrowserHeaders(
  fp: IBrowserFingerprint,
  referer: string,
  extra?: Record<string, string>,
): Record<string, string> {
  const platform =
    fp.platform === "Win32" ? "Windows" :
    fp.platform === "MacIntel" ? "macOS" : "Linux";

  return {
    "User-Agent": fp.userAgent,
    "Accept-Language": fp.acceptLanguage,
    "Accept": "application/json, text/plain, */*",
    "Referer": referer,
    "Origin": new URL(referer).origin,
    "sec-ch-ua": "\"Chromium\";v=\"124\", \"Google Chrome\";v=\"124\", \"Not-A.Brand\";v=\"99\"",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": `"${platform}"`,
    ...extra,
  };
}
