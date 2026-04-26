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

export interface ISessionManager {
  save(profileName: string, state: SessionState): Promise<void>;
  load(profileName: string): Promise<SessionState | null>;
  listProfiles(): Promise<string[]>;
  deleteProfile(profileName: string): Promise<void>;
}
