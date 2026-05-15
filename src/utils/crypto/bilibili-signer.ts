import crypto from "crypto";

/**
 * WBI 置换表 (MIXIN_KEY_ENC_TAB)。
 *
 * 来源：B站前端 wbi 签名模块 `mixinKeyEncTab`，通过逆向前端 JS 获取。
 * B站可能不定期更新此表。验证方法见 `extractWbiKeyEncTab()` 注释。
 *
 * 跟踪方式：
 * - 此文件的校验和通过 `getMixinKeyEncTabId()` 计算，可在运行时日志中对比。
 * - 测试用例通过 HAR 抓包对比验证置换表正确性（见 `signWbi HAR capture` 测试）。
 *
 * 更新方法：
 * 1. 打开 B站视频页面，按 F12 → 网络 → 搜索 `wbi` 找到任意 `w_rid` 请求。
 * 2. 复制请求的 query 参数和对应的 `w_rid` 值。
 * 3. 将参数和 img_key/sub_key（从 nav 接口或 sessionStorage 获取）代入 signWbi，
 *    如果计算结果与抓包 w_rid 不符，则置换表已更新。
 * 4. 访问 https://api.bilibili.com/x/web-interface/nav 获取最新的 nav 响应。
 * 5. 前端 JS 文件搜索 `mixinKeyEncTab` 或 `[46,47,18,2,53,8,23,32,...]` 找最新表。
 */
export const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
  27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
  37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
  22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
];

/**
 * 返回置换表内容的 MD5 摘要，用于在运行时识别置换表版本。
 * B站每次更新此表，摘要值会变化，可通过日志快速发现。
 */
export function getMixinKeyEncTabId(): string {
  return crypto.createHash("md5").update(
    MIXIN_KEY_ENC_TAB.join(","),
    "utf-8",
  ).digest("hex");
}

/**
 * 返回置换表的 JSON 字符串表示（用于日志输出）。
 */
export function getMixinKeyEncTabJson(): string {
  return JSON.stringify(MIXIN_KEY_ENC_TAB);
}

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
