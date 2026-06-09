/**
 * 构建 Cookie 头字符串，按域名过滤以避免 header 过大（>8KB 会被 CDN 拒绝）
 */
export function buildCookieHeader(cookies: Array<{ name: string; value: string; domain?: string }> | undefined, targetUrl: string): string {
  if (!cookies?.length) return "";
  try {
    const targetDomain = new URL(targetUrl).hostname;
    const filtered = cookies.filter((c) => !c.domain || targetDomain.includes(c.domain.replace(/^\./, "")));
    return filtered.map((c) => `${c.name}=${c.value}`).join("; ");
  } catch {
    return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  }
}
