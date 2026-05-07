/**
 * 抖音 x-secsdk-web-signature 签名客户端 v2。
 * 通过后端 DouyinSignService 获取浏览器运行时签名。
 */
import fetch from "node-fetch";

let baseUrl = "http://127.0.0.1:3001";
let timeout = 5000;

export function configureDouyinSignClient(url: string, t?: number): void {
  baseUrl = url;
  if (t) timeout = t;
}

export async function isDouyinSignServiceReady(): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/douyin/health`, { timeout: 2000 } as any);
    const data = await res.json() as any;
    return data.status === "ready";
  } catch {
    return false;
  }
}

/**
 * 获取 x-secsdk-web-signature。
 * @param endpoint API 路径，如 /aweme/v1/web/comment/list/
 * @returns signature 字符串
 * @throws 若服务不可用或签名不存在
 */
export async function getDouyinSignature(endpoint: string): Promise<string> {
  const url = `${baseUrl}/api/douyin/sign?endpoint=${encodeURIComponent(endpoint)}`;
  const res = await fetch(url, { timeout } as any);
  if (res.status === 503) throw new Error("抖音签名服务尚未就绪");
  if (res.status === 404) throw new Error(`签名未找到: ${endpoint}`);
  const data = await res.json() as any;
  return data.signature;
}
