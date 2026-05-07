import crypto from "crypto";

const BASE62 = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * 生成抖音 msToken（浏览器环境生成，此处纯 JS 模拟）。
 * 格式: 随机 22 位 base62 字符 + 时间戳。
 */
export function generateMsToken(): string {
  let rand = "";
  for (let i = 0; i < 22; i++) rand += BASE62[Math.floor(Math.random() * 62)];
  return rand + "_" + Date.now().toString(36);
}

/**
 * 生成 a_bogus 签名。
 *
 * 抖音 Web 版 a_bogus 是前端 JS 动态生成的签名参数，基于请求 URL、时间戳、
 * User-Agent、Cookie 等计算。
 *
 * 当前实现为 Phase 1 基础版本：
 * - 从 URL/UA/Cookie 提取特征
 * - MD5 摘要 + 时间戳
 * - 后续可对接 amagi 库的 douyinSign.AB() 获取真实签名
 *
 * @param url     完整请求 URL
 * @param userAgent User-Agent
 * @param cookie   请求 Cookie 字符串
 * @returns a_bogus 签名字符串
 */
export function generateABogus(url: string, userAgent?: string, cookie?: string): string {
  const ts = Date.now().toString(16);
  const uaHash = crypto.createHash("md5").update(userAgent || "", "utf-8").digest("hex").slice(0, 8);
  const cookieHash = crypto.createHash("md5").update(cookie || "", "utf-8").digest("hex").slice(0, 8);
  const urlHash = crypto.createHash("md5").update(url, "utf-8").digest("hex").slice(0, 8);

  const raw = `${ts}${uaHash}${cookieHash}${urlHash}`;
  const hash = crypto.createHash("sha256").update(raw, "utf-8").digest("hex");

  // 截取前 32 位作为 a_bogus
  let bogus = "";
  for (let i = 0; i < 32; i++) bogus += BASE62[parseInt(hash.slice(i * 2, i * 2 + 2), 16) % 62];

  return bogus;
}

/**
 * 为给定 URL 生成完整的抖音签名参数对象。
 * 返回 { a_bogus, msToken }。
 */
export function signDouyinRequest(
  url: string,
  userAgent?: string,
  cookie?: string,
): Record<string, string> {
  const msToken = generateMsToken();
  const aBogus = generateABogus(url, userAgent, cookie);
  return { a_bogus: aBogus, msToken };
}
