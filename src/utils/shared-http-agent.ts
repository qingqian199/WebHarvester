import https from "https";
import http from "http";
import { ProxyConfig } from "../core/ports/IProxyProvider";

let agent: https.Agent | null = null;

export function getSharedHttpAgent(): https.Agent {
  if (!agent) {
    agent = new https.Agent({
      keepAlive: true,
      keepAliveMsecs: 30000,
      maxSockets: 8,
      timeout: 30000,
    });
  }
  return agent;
}

export function getSharedHttpAgentForUrl(url: string): https.Agent | http.Agent {
  if (url.startsWith("https")) return getSharedHttpAgent();
  return new http.Agent({ keepAlive: true, keepAliveMsecs: 30000, maxSockets: 8 });
}

/** 为代理请求创建 Agent。使用系统环境变量或直接代理 URL。 */
export function getProxiedAgent(url: string, proxy: ProxyConfig): http.Agent | https.Agent {
  const proxyUrl = `${proxy.protocol}://${proxy.host}:${proxy.port}`;
  // 设置环境变量供底层 tunnel 使用
  if (url.startsWith("https")) {
    process.env.HTTPS_PROXY = proxyUrl;
  } else {
    process.env.HTTP_PROXY = proxyUrl;
  }
  if (proxy.username) process.env.PROXY_USERNAME = proxy.username;
  if (proxy.password) process.env.PROXY_PASSWORD = proxy.password;
  return getSharedHttpAgentForUrl(url);
}
