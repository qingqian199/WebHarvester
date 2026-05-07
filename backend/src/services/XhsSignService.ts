import crypto from "crypto";

const XXTEA_DELTA = 0x9e3779b9;
const CUSTOM_B64 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";
const STANDARD_B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function md5(input: string): string {
  return crypto.createHash("md5").update(input, "utf-8").digest("hex");
}

function toCustomBase64(standard: string): string {
  return standard.replace(/./g, (c) => {
    const idx = STANDARD_B64.indexOf(c);
    return idx >= 0 ? CUSTOM_B64[idx] : c;
  });
}

function customBase64Encode(data: Uint8Array): string {
  return toCustomBase64(Buffer.from(data).toString("base64"));
}

function uint32ToBytes(arr: number[], origLen: number): Uint8Array {
  const out = new Uint8Array(origLen);
  for (let i = 0; i < origLen; i++) {
    out[i] = (arr[i >>> 2] >>> ((i & 3) << 3)) & 0xff;
  }
  return out;
}

function bytesToUint32(data: Uint8Array): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    result.push(
      (data[i] | (data[i + 1] << 8) | (data[i + 2] << 16) | (data[i + 3] << 24)) >>> 0,
    );
  }
  return result;
}

function xxteaEncrypt(data: Uint8Array, key: Uint8Array): Uint8Array {
  const dataLen = data.length;
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
      const mx = ((a + b) >>> 0 ^ ((sum ^ v[yp]) + (k[(p ^ e) & 3] ^ v[zp])) >>> 0) >>> 0;
      v[p] = (v[p] - mx) >>> 0;
    }
    sum = (sum - XXTEA_DELTA) >>> 0;
  }
  return uint32ToBytes(v, dataLen);
}

function mnsv2(apiPath: string, data: string, a1Value: string, xt: string): string {
  const f = apiPath + data;
  const c = md5(f);
  const d = md5(apiPath);
  const keyStr = c + d;
  const key = Buffer.from(keyStr, "hex");
  const plaintext = Buffer.from(`${xt}${a1Value}${apiPath}${data}`, "utf-8");
  const paddedLen = Math.ceil(plaintext.length / 4) * 4;
  const padded = new Uint8Array(paddedLen);
  padded.set(plaintext);
  const encrypted = xxteaEncrypt(padded, key);
  return customBase64Encode(encrypted);
}

export interface XhsSignInput {
  apiPath: string;
  data: string;
  cookies?: Record<string, string>;
  userAgent?: string;
  platform?: string;
}

export interface XhsSignOutput {
  "X-s": string;
  "X-t": string;
  "X-s-common": string;
}

export class XhsSignService {
  private _ready = false;
  private _readyPromise: Promise<void>;
  private _resolveReady: (() => void) | null = null;

  constructor() {
    this._readyPromise = new Promise((resolve) => {
      this._resolveReady = resolve;
    });
  }

  get isReady(): boolean { return this._ready; }
  get readyPromise(): Promise<void> { return this._readyPromise; }

  async start(): Promise<void> {
    this._ready = true;
    this._resolveReady?.();
  }

  async stop(): Promise<void> {
    this._ready = false;
  }

  async sign(input: XhsSignInput): Promise<XhsSignOutput> {
    const xt = Date.now().toString();
    const a1 = input.cookies?.a1 ?? "";
    const xs = "XYS_" + mnsv2(input.apiPath, input.data, a1, xt);

    const info = {
      s0: Date.now().toString(36),
      s1: "",
      x0: "1",
      x1: "3.6.8",
      x2: input.platform === "Win32" ? "Windows" : input.platform === "MacIntel" ? "macOS" : "Linux",
      x3: "xhs-pc-web",
      x4: "4.0.16",
      x5: (input.userAgent || "").slice(0, 80),
      x6: "zh-CN",
      x7: "",
    };
    const common = Buffer.from(JSON.stringify(info)).toString("base64");

    return { "X-s": xs, "X-t": xt, "X-s-common": common };
  }
}
