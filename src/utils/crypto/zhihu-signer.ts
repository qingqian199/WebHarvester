import crypto from "crypto";

/**
 * 生成知乎 x-zse-96 签名头。
 *
 * 算法（社区逆向）：
 * 1. 将 API 路径 + 查询参数拼接待签名字符串
 * 2. MD5 哈希
 * 3. Base64 编码
 * 4. 加版本前缀 "2.0_"
 *
 * @param path 请求路径，如 "/api/v4/me"
 * @param params 查询参数字符串，如 "include=email"
 */
export function generateZse96(path: string, params?: string): string {
  const signStr = params ? `${path}?${params}` : path;
  const hash = crypto.createHash("md5").update(signStr, "utf-8").digest("hex");
  const b64 = Buffer.from(hash, "hex").toString("base64");
  return `2.0_${b64}`;
}

/**
 * 生成 x-api-version 头（知乎前端版本号）。
 */
export function generateApiVersion(): string {
  return "3.0.40";
}
