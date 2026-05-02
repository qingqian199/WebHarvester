/**
 * TikTok 签名 v2 — 通过 BrowserSignatureService 获取 X-Bogus/X-Gnarly。
 * 服务不可用时降级到 v1（Phase 1 MD5）。
 */
import { signWithBrowser, hasBrowserSignature } from "./browser-signature-service";
import { signTtRequest } from "./tiktok-signer";

/** 检查签名服务是否可用。 */
export async function isSignatureServerReady(): Promise<boolean> {
  try {
    await signWithBrowser("tiktok", "https://www.tiktok.com/health", {});
    return true;
  } catch {
    return false;
  }
}

/**
 * 综合签名函数：优先通过 BrowserSignatureService 获取 X-Bogus，
 * 服务不可用时降级到 v1 MD5。
 */
export async function signTtRequestV2(
  url: string,
  method: string,
  body: string | undefined,
  headers: Record<string, string>,
  cookie?: string,
): Promise<Record<string, string>> {
  if (hasBrowserSignature("tiktok")) {
    try {
      const result = await signWithBrowser("tiktok", url, headers, body, cookie);
      if (result["X-Bogus"]) return result;
    } catch {}
  }

  // 降级到 v1
  const ttwid = (cookie || headers["Cookie"] || "").match(/ttwid=([^;]+)/)?.[1] || "";
  const v1 = signTtRequest({ url, method, data: body, ttwid, userAgent: headers["User-Agent"] });
  return { ts: v1.ts, device_id: v1.device_id, sign: v1.sign };
}
