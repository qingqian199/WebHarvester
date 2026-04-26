export const AUTH_HEADER_KEYWORDS = [
  "authorization",
  "x-token",
  "x-access-token",
  "x-session-id",
  "x-csrf-token",
  "token",
  "access-token",
  "refresh-token",
  "sec-token"
];

export const AUTH_STORAGE_KEYWORDS = [
  "token",
  "access",
  "refresh",
  "session",
  "auth",
  "key",
  "secret",
  "jwt",
  "sso",
  "ticket"
];

export function extractAuthHeaders(headers: Record<string, string>): Record<string, string> {
  const res: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    const lk = k.toLowerCase();
    if (AUTH_HEADER_KEYWORDS.some(w => lk.includes(w))) {
      res[k] = v;
    }
  }
  return res;
}

export function extractAuthStorage(storage: Record<string, string>): Record<string, string> {
  const res: Record<string, string> = {};
  for (const [k, v] of Object.entries(storage)) {
    const lk = k.toLowerCase();
    if (AUTH_STORAGE_KEYWORDS.some(w => lk.includes(w))) {
      res[k] = v;
    }
  }
  return res;
}
