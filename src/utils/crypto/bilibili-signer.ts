import crypto from "crypto";

export const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
  27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
  37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
  22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
];

function getMixinKey(orig: string): string {
  return MIXIN_KEY_ENC_TAB.map((i) => orig[i]).join("").slice(0, 32);
}

/**
 * 生成 B站 WBI 签名（w_rid + wts）。
 * @param params 请求参数字典。
 * @param imgKey WBI img_key（可从 localStorage.wbi_img_url 提取）。
 * @param subKey WBI sub_key（可从 localStorage.wbi_sub_url 提取）。
 * @returns {w_rid, wts} 签名字符串。
 */
export function signWbi(
  params: Record<string, string>,
  imgKey: string,
  subKey: string,
  fixedWts?: string,
): { w_rid: string; wts: string } {
  const mixinKey = getMixinKey(imgKey + subKey);
  const wts = fixedWts ?? Math.floor(Date.now() / 1000).toString();
  const sorted = Object.entries({ ...params, wts }).sort(([a], [b]) => a.localeCompare(b));
  const query = sorted.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
  const w_rid = crypto.createHash("md5").update(query + mixinKey, "utf-8").digest("hex");
  return { w_rid, wts };
}

/**
 * 生成带 WBI 签名的完整查询字符串。
 */
export function buildSignedQuery(
  params: Record<string, string>,
  imgKey: string,
  subKey: string,
): string {
  const { w_rid, wts } = signWbi(params, imgKey, subKey);
  const all = { ...params, w_rid, wts };
  return Object.entries(all)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
}

/**
 * 从 localStorage 中的 wbi_img_url/wbi_sub_url 提取密钥字符串。
 * URL 格式示例: "https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077"
 */
export function extractWbiKey(url: string): string {
  try {
    return url.split("/").pop()?.split(".")[0] || "";
  } catch {
    return "";
  }
}
