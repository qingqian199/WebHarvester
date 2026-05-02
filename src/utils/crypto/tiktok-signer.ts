import crypto from "crypto";

/**
 * TikTok Web API 基础签名（Phase 1）。
 * 对请求参数排序后拼接设备指纹 + 时间戳，计算 MD5。
 * 后续可扩展为完整的 X-Bogus 签名。
 */

export interface TtSignParams {
  url: string;
  method: string;
  data?: string;
  ttwid?: string;
  userAgent?: string;
}

/**
 * 生成基础签名参数。
 * 返回 { ts, device_id, sign } 附加到请求参数中。
 */
export function signTtRequest(params: TtSignParams): Record<string, string> {
  const ts = Math.floor(Date.now() / 1000).toString();
  const deviceId = params.ttwid || "";
  const signStr = [params.url, params.method, ts, deviceId, params.userAgent || ""].join(":");
  const sign = crypto.createHash("md5").update(signStr, "utf-8").digest("hex").slice(0, 16);
  return { ts, device_id: deviceId.slice(0, 16), sign };
}

/**
 * 验证签名响应是否正确。
 */
export function verifyTtResponse(body: string): boolean {
  try {
    const parsed = JSON.parse(body);
    return parsed.status_code === 0 || parsed.statusCode === 0 || parsed.code === 0;
  } catch {
    return false;
  }
}
