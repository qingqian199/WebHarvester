import type { ChromeService } from "../services/ChromeService";

/**
 * ChromeService 全局实例桥。
 * 由 index.ts 启动时设置，供 API 路由和 MCP 工具访问。
 */

let _instance: ChromeService | null = null;

export function setChromeServiceInstance(inst: ChromeService | null): void {
  _instance = inst;
}

export function getChromeServiceInstance(): ChromeService | null {
  return _instance;
}

export function getChromeServiceHealth(): ReturnType<ChromeService["getHealth"]> | null {
  return _instance?.getHealth() ?? null;
}

export function getChromeServiceStatus(): string {
  if (!_instance) return "stopped";
  return _instance.isHealthy() ? "healthy" : _instance.isDegraded ? "degraded" : "unhealthy";
}
