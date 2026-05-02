import { Page } from "playwright";
import { CrawlerSession } from "../../core/ports/ISiteCrawler";
import { generateXsHeader } from "./xhs-signer";

const XHS_API_HOST = "edith.xiaohongshu.com";

/**
 * 在 Playwright 页面中注入签名拦截。
 * 拦截发往 edith.xiaohongshu.com/api/ 的请求，用 generateXsHeader 生成的正确签名
 * 替换 SDK 生成的签名，同时保留 SDK 注入的动态头（X-B3-TraceId、X-Xray-TraceId 等）。
 *
 * @param page    Playwright Page 实例
 * @param session 爬虫会话（需包含 cookies，特别是 a1）
 * @param fpUserAgent 用于 X-s-common 的 User-Agent
 * @param fpPlatform 用于 X-s-common 的平台字符串
 * @returns disable 函数，调用后取消拦截
 */
export function setupSignatureInjection(
  page: Page,
  session?: CrawlerSession,
  fpUserAgent?: string,
  fpPlatform?: string,
): () => void {
  const cookieMap: Record<string, string> = {};
  if (session) {
    for (const c of session.cookies) cookieMap[c.name] = c.value;
  }

  const routeHandler = async (route: any) => {
    try {
      const req = route.request();
      const url = req.url();
      const parsed = new URL(url);
      if (parsed.hostname !== XHS_API_HOST || !parsed.pathname.startsWith("/api/")) {
        await route.continue();
        return;
      }

      const method = req.method().toUpperCase();
      const postData = req.postData() || "";
      const apiPath = parsed.pathname;
      const signData = method === "POST" ? postData : parsed.search.replace("?", "");

      // 生成正确的签名头
      const xsHeaders = generateXsHeader(apiPath, signData, cookieMap);
      // X-s-common 直接构建（与 XhsCrawler.buildXsCommon 同逻辑）
      const commonInfo = {
        s0: Date.now().toString(36), s1: "", x0: "1", x1: "3.6.8",
        x2: fpPlatform === "Win32" ? "Windows" : fpPlatform === "MacIntel" ? "macOS" : "Linux",
        x3: "xhs-pc-web", x4: "4.0.16",
        x5: (fpUserAgent || "").slice(0, 80),
        x6: "zh-CN", x7: "",
      };
      const common = Buffer.from(JSON.stringify(commonInfo)).toString("base64");

      // 获取原请求头，替换签名相关字段，保留 SDK 添加的其他头
      const originalHeaders = req.headers();
      const modifiedHeaders: Record<string, string> = {};

      // 保留所有原请求头
      for (const [k, v] of Object.entries(originalHeaders)) {
        modifiedHeaders[k] = String(v);
      }

      // 覆盖签名头
      modifiedHeaders["x-s"] = xsHeaders["X-s"];
      modifiedHeaders["x-t"] = xsHeaders["X-t"];
      modifiedHeaders["x-s-common"] = common;

      await route.continue({ headers: modifiedHeaders });
    } catch {
      await route.continue();
    }
  };

  page.route("**/*", routeHandler);

  return () => {
    page.unroute("**/*", routeHandler).catch(() => {});
  };
}
