import crypto from "node:crypto";

// DS 签名使用的 salt（随米游社 app 版本变化）
// 当前值对应米游社 v2.70.0，需要定期更新
const MIYOUSHE_DS_SALT = "xV8v4Qu54lUKrEYFZkJhB8QOhkF8uV4V";
const API_HOST = "bbs-api.miyoushe.com";

/**
 * 生成米游社 DS 签名。
 * DS = `${salt}&${t}&${r}&${computed_hash}`
 * 用于 x-rpc-combo_key 和 DS 请求头。
 */
function generateDS(query: string, body?: string): string {
  const t = Math.floor(Date.now() / 1000);
  const r = crypto.randomBytes(4).toString("hex");
  let toSign = `salt=${MIYOUSHE_DS_SALT}&t=${t}&r=${r}`;
  if (query) toSign += `&b=${query}`;
  if (body) toSign += `&b=${body}`;
  const hash = crypto.createHash("md5").update(toSign).digest("hex");
  return `${t},${r},${hash}`;
}

/**
 * 构建米游社 API 请求头，包含 DS 签名和其他必要头。
 * @param query URL 查询字符串（如 "gids=2&post_id=xxx"）
 * @param body 请求体（POST 请求时使用）
 * @param deviceFp 设备指纹（可选，默认自动生成）
 */
export function buildMiyousheHeaders(query: string, body?: string, deviceFp?: string): Record<string, string> {
  return {
    "x-rpc-app_version": "2.70.0",
    "x-rpc-client_type": "5",
    "x-rpc-channel": "appstore",
    "x-rpc-device_fp": deviceFp || crypto.randomBytes(16).toString("hex"),
    "x-rpc-device_id": crypto.randomBytes(16).toString("hex"),
    "x-rpc-combo_key": generateDS(query, body),
    DS: generateDS(query, body),
    "x-rpc-sys_version": "14",
    "x-rpc-platform": "ios",
    "x-rpc-device_name": "iPhone15,2",
    "x-rpc-ram": "6291456",
    "x-rpc-rom": "128849018880",
    Referer: `https://${API_HOST}/`,
    Origin: `https://${API_HOST}`,
  };
}
