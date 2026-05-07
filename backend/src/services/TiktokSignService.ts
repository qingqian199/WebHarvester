import crypto from "crypto";
import http from "http";

export interface TiktokSignInput {
  url: string;
  method: string;
  body?: string;
  headers: Record<string, string>;
  cookie?: string;
}

export interface TiktokSignOutput {
  "X-Bogus"?: string;
  ts?: string;
  device_id?: string;
  sign?: string;
}

const TT_SIGNATURE_SERVICE_PORT = 8080;

function md5(input: string): string {
  return crypto.createHash("md5").update(input, "utf-8").digest("hex").toUpperCase();
}

function phase1Sign(url: string, method: string, body: string | undefined, headers: Record<string, string>, cookie?: string): TiktokSignOutput {
  const ttwid = (cookie || headers["Cookie"] || "").match(/ttwid=([^;]+)/)?.[1] || "";
  const ua = headers["User-Agent"] || "";
  const ts = (Math.floor(Date.now() / 1000) - 60).toString();
  const randStr = Math.random().toString(36).slice(2, 8);
  const deviceId = `${ts}${randStr}`;
  const signStr = `ts=${ts}&device_id=${deviceId}&ttwid=${ttwid}&data=${body || ""}&method=${method}&url=${url}&ua=${ua}`;
  const sign = md5(signStr);
  return { ts, device_id: deviceId, sign };
}

async function signViaService(input: TiktokSignInput): Promise<TiktokSignOutput> {
  const cookie = input.cookie || input.headers["Cookie"] || "";
  const payload = JSON.stringify({
    url: input.url,
    headers: input.headers,
    method: input.body ? "POST" : "GET",
    body: input.body || "",
    cookie,
  });

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "localhost",
        port: TT_SIGNATURE_SERVICE_PORT,
        path: "/signature",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
        timeout: 15000,
      },
      (res: any) => {
        let data = "";
        res.on("data", (chunk: Buffer) => (data += chunk.toString()));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.status === "ok" && parsed.data?.signed_url) {
              const u = new URL(parsed.data.signed_url);
              const result: TiktokSignOutput = {};
              const params = ["X-Bogus", "X-Gnarly", "msToken", "X-Khronos", "X-Ladon"];
              for (const name of params) {
                const val = u.searchParams.get(name);
                if (val) result[name as keyof TiktokSignOutput] = val;
              }
              resolve(result);
            } else {
              reject(new Error("签名服务返回异常: " + JSON.stringify(parsed).slice(0, 100)));
            }
          } catch { reject(new Error("签名服务返回非法 JSON")); }
        });
      },
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

export class TiktokSignService {
  private _ready = false;
  private _readyPromise: Promise<void>;
  private _resolveReady: (() => void) | null = null;
  private _serviceAvailable = true;

  constructor() {
    this._readyPromise = new Promise((resolve) => {
      this._resolveReady = resolve;
    });
  }

  get isReady(): boolean { return this._ready; }
  get readyPromise(): Promise<void> { return this._readyPromise; }

  async start(): Promise<void> {
    try {
      await this.healthCheck();
      this._serviceAvailable = true;
    } catch {
      this._serviceAvailable = false;
    }
    this._ready = true;
    this._resolveReady?.();
  }

  async stop(): Promise<void> {
    this._ready = false;
  }

  async sign(input: TiktokSignInput): Promise<TiktokSignOutput> {
    if (this._serviceAvailable) {
      try {
        const result = await signViaService(input);
        if (result["X-Bogus"]) return result;
      } catch {}
    }
    return phase1Sign(input.url, input.method, input.body, input.headers, input.cookie);
  }

  private healthCheck(): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = http.get(
        `http://localhost:${TT_SIGNATURE_SERVICE_PORT}/health`,
        (res: any) => {
          let data = "";
          res.on("data", (chunk: Buffer) => (data += chunk.toString()));
          res.on("end", () => resolve());
        },
      );
      req.on("error", reject);
      req.setTimeout(3000, () => { req.destroy(); reject(new Error("timeout")); });
    });
  }
}
