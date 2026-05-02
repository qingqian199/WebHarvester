import http from "http";

interface SignatureServiceConfig {
  port: number;
  healthEndpoint: string;
  signatureEndpoint: string;
}

const registry = new Map<string, SignatureServiceConfig>();

/** 注册一个站点的浏览器签名服务。 */
export function registerBrowserSignature(site: string, config: SignatureServiceConfig): void {
  registry.set(site, config);
}

/** 注销一个站点。 */
export function unregisterBrowserSignature(site: string): void {
  registry.delete(site);
}

/** 检查站点是否注册了签名服务。 */
export function hasBrowserSignature(site: string): boolean {
  return registry.has(site);
}

/** 获取注册的签名服务配置。 */
export function getSignatureConfig(site: string): SignatureServiceConfig | undefined {
  return registry.get(site);
}

// ─── 默认注册已知站点 ───
registerBrowserSignature("tiktok", {
  port: 8080,
  healthEndpoint: "/health",
  signatureEndpoint: "/signature",
});

/**
 * 通过浏览器签名服务生成签名头。
 * @param site 站点标识（如 'tiktok'）
 * @param url  需要签名的完整请求 URL
 * @param headers 当前请求头（用于提取 cookie、UA 等）
 * @param body 请求体（POST 时）
 * @param cookieStr 完整 cookie 字符串（可选，默认从 headers 提取）
 */
export async function signWithBrowser(
  site: string,
  url: string,
  headers: Record<string, string>,
  body?: string,
  cookieStr?: string,
): Promise<Record<string, string>> {
  const config = registry.get(site);
  if (!config) throw new Error(`未注册的站点: ${site}`);

  // 健康检查
  await healthCheck(site);

  // 调用签名端点
  const cookie = cookieStr || headers["Cookie"] || "";
  const payload = JSON.stringify({ url, headers, method: body ? "POST" : "GET", body: body || "", cookie });

  const result = await httpPost(config.port, config.signatureEndpoint, payload);
  if (result.status === "ok" && result.data?.signed_url) {
    return extractParams(result.data.signed_url);
  }
  throw new Error(`签名失败: ${JSON.stringify(result).slice(0, 100)}`);
}

async function healthCheck(site: string): Promise<void> {
  const config = registry.get(site);
  if (!config) return;
  try {
    await httpGet(config.port, config.healthEndpoint, 3000);
  } catch {
    throw new Error(`签名服务 [${site}] 不可用 (port ${config.port})`);
  }
}

function extractParams(signedUrl: string): Record<string, string> {
  const result: Record<string, string> = {};
  try {
    const u = new URL(signedUrl);
    const paramNames = ["X-Bogus", "X-Gnarly", "msToken", "X-Khronos", "X-Ladon"];
    for (const name of paramNames) {
      const val = u.searchParams.get(name);
      if (val) result[name] = val;
    }
  } catch {}
  return result;
}

function httpGet(port: number, path: string, timeout = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://localhost:${port}${path}`, (res) => {
      let data = "";
      res.on("data", (chunk: Buffer) => (data += chunk.toString()));
      res.on("end", () => resolve(data));
    });
    req.on("error", reject);
    req.setTimeout(timeout, () => { req.destroy(); reject(new Error("timeout")); });
  });
}

function httpPost(port: number, path: string, body: string, timeout = 15000): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "localhost", port, path, method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
        timeout,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => (data += chunk.toString()));
        res.on("end", () => { try { resolve(JSON.parse(data)); } catch { resolve({ raw: data }); } });
      },
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}
