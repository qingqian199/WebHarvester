import { BizError } from "../core/error/BizError";
import { ErrorCode } from "../core/error/ErrorCode";

export function isValidUrl(url: string): boolean {
  try { new URL(url); return true; } catch { return false; }
}

export function ensureValidUrl(url: string): void {
  if (!isValidUrl(url)) throw new BizError(ErrorCode.INVALID_URL, `非法网址:${url}`);
}

export function safeRegExp(pattern: string, flags = "gi"): RegExp | null {
  try { return new RegExp(pattern, flags); } catch { return null; }
}

export function filterEmptySelectors(selectors: string[]): string[] {
  return selectors.filter(s => typeof s === "string" && s.trim());
}

export function resolveUrl(base: string, path: string): string {
  const baseNormalized = base.replace(/\/+$/, "");
  const pathNormalized = path.replace(/^\/+/, "");
  return `${baseNormalized}/${pathNormalized}`;
}
