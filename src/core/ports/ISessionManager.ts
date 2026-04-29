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

/** 登录会话管理器端口。支持会话的持久化、加载、列举和删除。 */
export interface ISessionManager {
  /** 将会话保存到指定 profile 名称下。 */
  save(profileName: string, state: SessionState): Promise<void>;
  /** 加载指定 profile 的会话，不存在返回 null。 */
  load(profileName: string): Promise<SessionState | null>;
  /** 列举所有已保存的 profile 名称。 */
  listProfiles(): Promise<string[]>;
  /** 删除指定 profile 的会话。 */
  deleteProfile(profileName: string): Promise<void>;
}
