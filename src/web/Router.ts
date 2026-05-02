import http from "http";

export type RouteHandler = (req: http.IncomingMessage, res: http.ServerResponse, params?: Record<string, string>) => Promise<void>;

interface RouteEntry {
  pattern: RegExp;
  paramNames: string[];
  handler: RouteHandler;
  method: string;
}

/**
 * 轻量路由注册表。支持三种匹配模式：
 * - 精确匹配："/api/health"
 * - 前缀匹配："/api/results/" → 匹配 /api/results/xxx
 * - 参数匹配："/api/results/:filename"
 */
export class Router {
  private routes: RouteEntry[] = [];

  /**
   * 注册路由。
   * @param method HTTP 方法（GET/POST/DELETE/OPTIONS），或 "*" 表示任意方法。
   * @param path 路径模式。支持 :param 占位符和精确字符串匹配。
   * @param handler 请求处理函数。
   */
  register(method: string, path: string, handler: RouteHandler): void {
    const paramNames: string[] = [];
    const escaped = path.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    const patternStr = escaped.replace(/:(\w+)/g, (_, name) => {
      paramNames.push(name);
      return "([^/]+)";
    });
    const pattern = new RegExp(`^${patternStr}$`);
    this.routes.push({ pattern, paramNames, handler, method });
  }

  /**
   * 解析请求，返回匹配的 handler 和路径参数。
   * 按注册顺序匹配（先注册优先）。
   */
  resolve(method: string, url: string): { handler: RouteHandler; params: Record<string, string> } | null {
    // 分离路径和查询参数
    const pathname = url.split("?")[0];
    for (const entry of this.routes) {
      if (entry.method !== "*" && entry.method !== method) continue;
      const match = pathname.match(entry.pattern);
      if (match) {
        const params: Record<string, string> = {};
        for (let i = 0; i < entry.paramNames.length; i++) {
          params[entry.paramNames[i]] = decodeURIComponent(match[i + 1]);
        }
        return { handler: entry.handler, params };
      }
    }
    return null;
  }
}
