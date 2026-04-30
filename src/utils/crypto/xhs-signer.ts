import crypto from "crypto";

// ── 常量 ───────────────────────────────────────────────

const XXTEA_DELTA = 0x9e3779b9;

const CUSTOM_B64 =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";
const STANDARD_B64 =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

// ── MD5 ────────────────────────────────────────────────

/** 标准 MD5 哈希，返回 32 位十六进制小写字符串。 */
export function md5(input: string): string {
  return crypto.createHash("md5").update(input, "utf-8").digest("hex");
}

// ── 自定义 Base64 ──────────────────────────────────────

/** 将标准 Base64 字符串转换为小红书自定义 Base64。 */
function toCustomBase64(standard: string): string {
  return standard.replace(/./g, (c) => {
    const idx = STANDARD_B64.indexOf(c);
    return idx >= 0 ? CUSTOM_B64[idx] : c;
  });
}

/** 将自定义 Base64 字符串转换回标准 Base64（用于解码）。 */
function fromCustomBase64(custom: string): string {
  return custom.replace(/./g, (c) => {
    const idx = CUSTOM_B64.indexOf(c);
    return idx >= 0 ? STANDARD_B64[idx] : c;
  });
}

/** 自定义 Base64 编码。 */
export function customBase64Encode(data: Uint8Array): string {
  const standard = Buffer.from(data).toString("base64");
  return toCustomBase64(standard);
}

/** 自定义 Base64 解码。 */
export function customBase64Decode(encoded: string): Uint8Array {
  const standard = fromCustomBase64(encoded);
  return Buffer.from(standard, "base64");
}

// ── XXTEA ──────────────────────────────────────────────

/** 将 Uint8Array 转为 32 位无符号整数数组（小端序）。 */
function bytesToUint32(data: Uint8Array): Uint32Array {
  const len = Math.ceil(data.length / 4);
  const out = new Uint32Array(len);
  for (let i = 0; i < data.length; i++) {
    out[i >> 2] |= data[i] << ((i & 3) << 3);
  }
  return out;
}

/** 将 32 位无符号整数数组转为 Uint8Array（小端序）。*/
function uint32ToBytes(data: Uint32Array, length: number): Uint8Array {
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    out[i] = (data[i >> 2] >>> ((i & 3) << 3)) & 0xff;
  }
  return out;
}

/**
 * XXTEA 加密（Corrected Block TEA）。
 * @param data 明文数据（自动补齐到 4 字节对齐）。
 * @param key  16 字节密钥（转为 4 个 32 位无符号整数）。
 */
export function xxteaEncrypt(data: Uint8Array, key: Uint8Array): Uint8Array {
  const dataLen = Math.ceil(data.length / 4) * 4;
  const padded = new Uint8Array(dataLen);
  padded.set(data);

  const v = bytesToUint32(padded);
  const k = bytesToUint32(key);
  const n = v.length;

  if (n < 2) return data;

  const q = 6 + Math.floor(52 / n);
  let sum = 0;

  for (let round = 0; round < q; round++) {
    sum = (sum + XXTEA_DELTA) >>> 0;
    const e = (sum >>> 2) & 3;
    for (let p = 0; p < n; p++) {
      const zp = (p + n - 1) % n;
      const yp = (p + 1) % n;
      const a = (v[zp] >>> 5 ^ v[yp] << 2) >>> 0;
      const b = (v[yp] >>> 3 ^ v[zp] << 4) >>> 0;
      const mxPart1 = (a + b) >>> 0;
      const mxPart2 = ((sum ^ v[yp]) + (k[(p ^ e) & 3] ^ v[zp])) >>> 0;
      const mx = (mxPart1 ^ mxPart2) >>> 0;
      v[p] = (v[p] + mx) >>> 0;
    }
  }

  return uint32ToBytes(v, dataLen);
}

/**
 * XXTEA 解密。
 */
export function xxteaDecrypt(data: Uint8Array, key: Uint8Array): Uint8Array {
  const dataLen = Math.ceil(data.length / 4) * 4;
  const padded = new Uint8Array(dataLen);
  padded.set(data);

  const v = bytesToUint32(padded);
  const k = bytesToUint32(key);
  const n = v.length;

  if (n < 2) return data;

  const q = 6 + Math.floor(52 / n);
  let sum = (q * XXTEA_DELTA) >>> 0;

  while (sum !== 0) {
    const e = (sum >>> 2) & 3;
    for (let p = n - 1; p >= 0; p--) {
      const zp = (p + n - 1) % n;
      const yp = (p + 1) % n;
      const a = (v[zp] >>> 5 ^ v[yp] << 2) >>> 0;
      const b = (v[yp] >>> 3 ^ v[zp] << 4) >>> 0;
      const mxPart1 = (a + b) >>> 0;
      const mxPart2 = ((sum ^ v[yp]) + (k[(p ^ e) & 3] ^ v[zp])) >>> 0;
      const mx = (mxPart1 ^ mxPart2) >>> 0;
      v[p] = (v[p] - mx) >>> 0;
    }
    sum = (sum - XXTEA_DELTA) >>> 0;
  }

  return uint32ToBytes(v, dataLen);
}

// ── 签名核心（mnsv2） ──────────────────────────────────

/**
 * mnsv2 核心签名。
 * @param apiPath  API 路径，如 "/api/sns/web/v1/search/recommend"。
 * @param data     POST 请求体（字符串）或查询参数。
 * @param a1Value  Cookie a1 的值。
 * @param xt       X-t 时间戳字符串。
 */
export function mnsv2(
  apiPath: string,
  data: string,
  a1Value: string,
  xt: string,
): string {
  const f = apiPath + data;
  const c = md5(f);
  const d = md5(apiPath);
  const keyStr = c + d;
  const key = Buffer.from(keyStr, "hex");

  const plaintext = Buffer.from(
    `${xt}${a1Value}${apiPath}${data}`,
    "utf-8",
  );

  // 补齐到 4 字节对齐（XXTEA 要求）
  const paddedLen = Math.ceil(plaintext.length / 4) * 4;
  const padded = new Uint8Array(paddedLen);
  padded.set(plaintext);

  const encrypted = xxteaEncrypt(padded, key);
  return customBase64Encode(encrypted);
}

/**
 * 生成完整 X-s / X-t 请求头。
 * @param apiPath  请求路径。
 * @param data     请求体（字符串，可空）。
 * @param cookies  Cookie 对象（需包含 a1）。
 */
export function generateXsHeader(
  apiPath: string,
  data: string,
  cookies?: Record<string, string>,
): { "X-s": string; "X-t": string } {
  const xt = Date.now().toString();
  const a1 = cookies?.a1 ?? "";
  const x3 = mnsv2(apiPath, data, a1, xt);

  const payload = JSON.stringify({
    x0: "1",
    x1: a1,
    x2: xt,
    x3,
    x4: "1",
  });

  const xs = "XYS_" + customBase64Encode(Buffer.from(payload, "utf-8"));

  return { "X-s": xs, "X-t": xt };
}
