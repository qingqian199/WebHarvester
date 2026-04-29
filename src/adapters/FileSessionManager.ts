import fs from "fs/promises";
import path from "path";
import { ISessionManager, SessionState } from "../core/ports/ISessionManager";
import { BizError } from "../core/error/BizError";
import { ErrorCode } from "../core/error/ErrorCode";

const SESSION_ROOT = path.resolve("./sessions");

export class FileSessionManager implements ISessionManager {
  constructor() {
    this.ensureDir();
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(SESSION_ROOT, { recursive: true });
  }

  private getProfilePath(name: string): string {
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, "_");
    return path.join(SESSION_ROOT, `${safeName}.session.json`);
  }

  async save(profileName: string, state: SessionState): Promise<void> {
    const filePath = this.getProfilePath(profileName);
    state.lastUsedAt = Date.now();
    try {
      await fs.writeFile(filePath, JSON.stringify(state, null, 2), "utf-8");
    } catch (err) {
      throw new BizError(ErrorCode.FS_WRITE_FAILED, `会话保存失败：${(err as Error).message}`);
    }
  }

  async load(profileName: string): Promise<SessionState | null> {
    const filePath = this.getProfilePath(profileName);
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      const state = JSON.parse(raw) as SessionState;
      state.lastUsedAt = Date.now();
      await fs.writeFile(filePath, JSON.stringify(state, null, 2), "utf-8");
      return state;
    } catch {
      return null;
    }
  }

  async listProfiles(): Promise<string[]> {
    await this.ensureDir();
    const files = await fs.readdir(SESSION_ROOT);
    return files.filter(f => f.endsWith(".session.json")).map(f => f.replace(".session.json", ""));
  }

  async deleteProfile(profileName: string): Promise<void> {
    const filePath = this.getProfilePath(profileName);
    try {
      await fs.unlink(filePath);
    } catch {}
  }
}
