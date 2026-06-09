/**
 * MCP 浏览器适配器 — 通过 Playwright MCP 实现 IBrowserAdapter
 *
 * 将 web-harvester 的标准浏览器接口映射到 Playwright MCP 的 20+ 工具
 */
import { IBrowserAdapter } from "../core/ports/IBrowserAdapter";
import { HarvestConfig, NetworkRequest, ElementItem, StorageSnapshot } from "../core/models";
import { SessionState } from "../core/ports/ISessionManager";
import { callTool, startMcp, stopMcp } from "./client";
import { FileSessionManager } from "../adapters/FileSessionManager";
import { MOBILE_FINGERPRINTS } from "../adapters/RealisticFingerprintProvider";

export class McpBrowserAdapter implements IBrowserAdapter {
  private launched = false;
  private startTime = 0;
  private currentUrl = "";
  private device: "pc" | "iPhone" | "Android";

  constructor(device: "pc" | "iPhone" | "Android" = "pc") {
    this.device = device;
  }

  async launch(
    url: string,
    sessionState?: SessionState,
    _proxyUrl?: string,
    _pageSetup?: (page: any) => Promise<void>,
    enableFullCapture?: boolean,
    _captureAllTypes?: boolean,
  ): Promise<void> {
    this.currentUrl = url;
    this.startTime = Date.now();
    await startMcp(true);

    // 设置移动端模拟（如果开启）
    if (this.device !== "pc") {
      const device = MOBILE_FINGERPRINTS[this.device];
      if (device) {
        await callTool("browser_evaluate", {
          function: `navigator.__defineGetter__('userAgent', ()=>'${device.userAgent.replace(/'/g, "\\'")}')`,
        }).catch(() => {});
        await callTool("browser_resize", { width: device.viewport.width, height: device.viewport.height });
      }
    }

    await callTool("browser_navigate", { url });
    // 等待页面加载
    await new Promise((r) => setTimeout(r, 3000));

    // 注入已有登录态
    if (sessionState?.cookies?.length) {
      try {
        const cookieStr = sessionState.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
        await callTool("browser_evaluate", {
          function: `document.cookie = "${cookieStr.replace(/"/g, "\\\"")}"`,
        });
      } catch {}
    }

    // 自动截图（增强全量模式）
    if (enableFullCapture) {
      try {
        await callTool("browser_take_screenshot", {});
      } catch {}
    }

    this.launched = true;
  }

  async performActions(actions: HarvestConfig["actions"]): Promise<void> {
    if (!actions?.length) return;
    for (const act of actions) {
      switch (act.type) {
        case "click":
          if (act.selector) await callTool("browser_click", { target: act.selector });
          break;
        case "input":
          if (act.selector && act.value) await callTool("browser_type", { target: act.selector, text: act.value });
          break;
        case "wait":
          await new Promise((r) => setTimeout(r, act.waitTime ?? 1000));
          break;
        case "navigate":
          if (act.value) await callTool("browser_navigate", { url: act.value });
          break;
      }
    }
  }

  async captureNetworkRequests(_config: { captureAll: boolean; enhancedFullCapture?: boolean }): Promise<NetworkRequest[]> {
    // Playwright MCP 不直接提供网络捕获，返回空数组
    return [];
  }

  async queryElements(_selectors: string[]): Promise<ElementItem[]> {
    // 可通过 playwright_evaluate 实现 CSS 选择器查询
    return [];
  }

  async getStorage(types: Array<"localStorage" | "sessionStorage" | "cookies">): Promise<StorageSnapshot> {
    const storage: StorageSnapshot = { localStorage: {}, sessionStorage: {}, cookies: [] };
    if (types.includes("cookies")) {
      try {
        const result = await callTool("browser_evaluate", { function: "document.cookie" });
        const cookieText = (result as any).content?.[0]?.text || "";
        storage.cookies = cookieText
          .split(";")
          .filter(Boolean)
          .map((pair: string) => {
            const [name, ...rest] = pair.trim().split("=");
            return { name: name?.trim() || "", value: rest.join("=")?.trim() || "" };
          });
      } catch {}
    }
    if (types.includes("localStorage")) {
      try {
        const result = await callTool("browser_evaluate", { function: "JSON.stringify(window.localStorage)" });
        storage.localStorage = JSON.parse((result as any).content?.[0]?.text || "{}");
      } catch {}
    }
    if (types.includes("sessionStorage")) {
      try {
        const result = await callTool("browser_evaluate", { function: "JSON.stringify(window.sessionStorage)" });
        storage.sessionStorage = JSON.parse((result as any).content?.[0]?.text || "{}");
      } catch {}
    }
    return storage;
  }

  async executeScript<T>(script: string): Promise<T> {
    const result = await callTool("browser_evaluate", { function: script });
    const text = (result as any).content?.[0]?.text || "";
    // 从 MCP 响应中提取实际值（格式: ### Result\n"value"\n### Ran Playwright code\n...）
    const match = text.match(/"([^"]+)"/);
    const clean = match ? match[1] : text.split("###")[0].trim();
    try {
      return JSON.parse(clean);
    } catch {
      return clean as T;
    }
  }

  getPageMetrics() {
    return null;
  }

  getPageDiagnostics() {
    return { consoleMessages: [], pageErrors: [] };
  }

  async close(): Promise<void> {
    if (!this.launched) return;

    // 自动保存 Cookie 到会话管理器
    try {
      const result = await callTool("browser_evaluate", { function: "document.cookie" });
      const cookieText = (result as any).content?.[0]?.text || "";
      const cookies = cookieText
        .split(";")
        .filter(Boolean)
        .map((pair: string) => {
          const [name, ...rest] = pair.trim().split("=");
          return { name: name?.trim() || "", value: rest.join("=")?.trim() || "" };
        });
      if (cookies.length > 0) {
        const domain = new URL(this.currentUrl).hostname.replace(/^www\./, "").split(".")[0];
        const sessionMgr = new FileSessionManager();
        await sessionMgr.save(`${domain}:mcp`, {
          cookies: cookies.map((c: any) => ({ name: c.name, value: c.value, domain: `.${domain}`, path: "/" })),
          localStorage: {},
          sessionStorage: {},
          createdAt: Date.now(),
          lastUsedAt: Date.now(),
        });
      }
    } catch {}

    try {
      await callTool("browser_close", {});
    } catch {}
    stopMcp();
    this.launched = false;
  }
}
