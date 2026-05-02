import { BizError } from "../core/error/BizError";
import { ErrorCode } from "../core/error/ErrorCode";

const ALLOWED_PROTOCOLS = ["http:", "https:"];
const LOCAL_HOSTNAMES = ["localhost", "localhost.localdomain", "127.0.0.1", "0.0.0.0", "::1", "[::1]"];
const METADATA_IPS = ["169.254.169.254"];

/** 清理 URL 中的 CRLF 注入字符和 null 字节，返回 null 表示输入不合法。 */
export function sanitizeUrl(url: string): string | null {
  let clean = url.replace(/[\r\n\0]/g, "");
  clean = clean.trim();
  return clean || null;
}

/**
 * 校验 URL 基本合法性：
 * - 必须为 http: 或 https: 协议
 * - 必须能被 URL 构造函数解析
 */
export function isValidUrl(url: string): boolean {
  const clean = sanitizeUrl(url);
  if (!clean) return false;
  try {
    const parsed = new URL(clean);
    return ALLOWED_PROTOCOLS.includes(parsed.protocol);
  } catch {
    return false;
  }
}

/** 检查 hostname 是否为可对外访问的公网地址。返回 false 表示禁止访问。 */
export function isPublicHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (LOCAL_HOSTNAMES.includes(lower)) return false;
  if (METADATA_IPS.includes(lower)) return false;

  const ipMatch = lower.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipMatch) {
    const o1 = parseInt(ipMatch[1], 10);
    const o2 = parseInt(ipMatch[2], 10);
    if (o1 === 10) return false;
    if (o1 === 172 && o2 >= 16 && o2 <= 31) return false;
    if (o1 === 192 && o2 === 168) return false;
    if (o1 === 127) return false;
    if (o1 === 0) return false;
    if (o1 === 169 && o2 === 254) return false;
  }

  return true;
}

/** 完整校验 URL：CRLF 清理 → 协议校验 → 主机名校验。不合法时抛出 BizError。 */
export function validateUrl(url: string): void {
  const clean = sanitizeUrl(url);
  if (!clean) {
    throw new BizError(ErrorCode.INVALID_URL, "URL 不合法：输入为空或仅含空白字符");
  }
  if (!isValidUrl(clean)) {
    throw new BizError(ErrorCode.INVALID_URL, "URL 不合法：禁止的协议或无效格式");
  }
  try {
    const parsed = new URL(clean);
    if (!isPublicHostname(parsed.hostname)) {
      throw new BizError(ErrorCode.INVALID_URL, "URL 不合法：禁止访问内网地址");
    }
  } catch (e) {
    if (e instanceof BizError) throw e;
    throw new BizError(ErrorCode.INVALID_URL, "URL 不合法：无法解析主机名");
  }
}
