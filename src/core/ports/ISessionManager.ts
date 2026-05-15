/** 浏览器会话快照，包含 cookies 和 Web Storage 数据，用于登录态持久化。 */
export interface SessionState {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path?: string;
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: string;
  }>;
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  createdAt: number;
  lastUsedAt: number;
}

export interface AccountInfo {
  accountId: string;
  valid: boolean;
  createdAt: number;
  lastUsedAt: number;
  cookieCount: number;
}

/** 会话验证结果。 */
export interface SessionValidation {
  valid: boolean;
  detail?: string;
}

/** 登录会话管理器端口。支持多账号、轮换、过期检测。 */
export interface ISessionManager {
  save(profileName: string, state: SessionState, merge?: boolean): Promise<void>;
  load(profileName: string): Promise<SessionState | null>;
  listProfiles(): Promise<string[]>;
  deleteProfile(profileName: string): Promise<void>;
  getSession(domain: string, accountId?: string): Promise<{ state: SessionState; accountId: string } | null>;
  listAccounts(domain: string): Promise<AccountInfo[]>;
  getNextActiveAccount(domain: string): Promise<string | null>;
  markInvalid(domain: string, accountId: string): Promise<void>;
  resetInvalidAccount(domain: string, accountId: string): Promise<void>;
  validateSession(profileName: string): Promise<SessionValidation>;
}
