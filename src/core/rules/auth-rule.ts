export const AUTH_HEADER_KEYWORDS = [
  "authorization", "x-token", "x-access-token", "x-session-id",
  "x-csrf-token", "token", "access-token", "refresh-token", "sec-token"
];

export const AUTH_STORAGE_KEYWORDS = [
  "token", "access", "refresh", "session", "auth", "key",
  "secret", "jwt", "sso", "ticket"
];

export function extractAuthHeaders(headers: Record<string, string>): Record<string, string> {
  const res: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    const lk = k.toLowerCase();
    if (AUTH_HEADER_KEYWORDS.some(w => lk.includes(w))) res[k] = v;
  }
  return res;
}

function extractTokensFromObject(obj: any, prefix = ''): Record<string, string> {
  const res: Record<string, string> = {};
  if (!obj || typeof obj !== 'object') return res;
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (AUTH_STORAGE_KEYWORDS.some(w => fullKey.toLowerCase().includes(w))) {
      res[fullKey] = typeof v === 'string' ? v : JSON.stringify(v);
    }
    if (v && typeof v === 'object') {
      Object.assign(res, extractTokensFromObject(v, fullKey));
    }
  }
  return res;
}

export function extractAuthStorage(storage: Record<string, string>): Record<string, string> {
  let res: Record<string, string> = {};
  for (const [k, v] of Object.entries(storage)) {
    const lk = k.toLowerCase();
    if (AUTH_STORAGE_KEYWORDS.some(w => lk.includes(w))) res[k] = v;
    try {
      const parsed = JSON.parse(v);
      if (parsed && typeof parsed === 'object') {
        Object.assign(res, extractTokensFromObject(parsed, k));
      }
    } catch {
      // 非 JSON 字符串，不处理
    }
  }
  return res;
}
