import fs from "fs/promises";
import path from "path";
import { ISessionManager, SessionState } from "../core/ports/ISessionManager";
import { BizError } from "../core/error/BizError";
import { ErrorCode } from "../core/error/ErrorCode";
import { encryptField, decryptField, isEncrypted, getMasterKey } from "../utils/crypto/confidential";
import { ConsoleLogger } from "./ConsoleLogger";

const SESSION_ROOT = path.resolve("./sessions");

export class FileSessionManager implements ISessionManager {
  private masterKeyPromise: Promise<Buffer> | null = null;

  constructor() {
    this.ensureDir();
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(SESSION_ROOT, { recursive: true });
  }

  private getMasterKey(): Promise<Buffer> {
    if (!this.masterKeyPromise) {
      this.masterKeyPromise = getMasterKey();
    }
    return this.masterKeyPromise;
  }

  private getProfilePath(name: string): string {
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, "_");
    return path.join(SESSION_ROOT, `${safeName}.session.json`);
  }

  async save(profileName: string, state: SessionState): Promise<void> {
    const filePath = this.getProfilePath(profileName);
    state.lastUsedAt = Date.now();
    try {
      const key = await this.getMasterKey();
      const encrypted = {
        ...state,
        cookies: state.cookies.map((c) => ({
          ...c,
          value: encryptField(c.value, key),
        })),
        localStorage: Object.fromEntries(
          Object.entries(state.localStorage).map(([k, v]) => [k, encryptField(v, key)]),
        ),
      };
      await fs.writeFile(filePath, JSON.stringify(encrypted, null, 2), "utf-8");
    } catch (err) {
      throw new BizError(ErrorCode.FS_WRITE_FAILED, `会话保存失败：${(err as Error).message}`);
    }
  }

  async load(profileName: string): Promise<SessionState | null> {
    const filePath = this.getProfilePath(profileName);
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      const state = JSON.parse(raw) as SessionState & { cookies: Array<Record<string, unknown>> };
      const key = await this.getMasterKey();

      // 自动升级：检测旧格式（明文）并解密为新格式
      const cookies = state.cookies.map((c: Record<string, unknown>) => ({
        name: String(c.name),
        value: typeof c.value === "string" && isEncrypted(c.value)
          ? decryptField(c.value, key)
          : String(c.value),
        domain: String(c.domain ?? ""),
        path: c.path != null ? String(c.path) : undefined,
        secure: c.secure != null ? Boolean(c.secure) : undefined,
        httpOnly: c.httpOnly != null ? Boolean(c.httpOnly) : undefined,
        sameSite: c.sameSite != null ? String(c.sameSite) : undefined,
      }));

      const localStorage: Record<string, string> = {};
      for (const [k, v] of Object.entries(state.localStorage || {})) {
        localStorage[k] = typeof v === "string" && isEncrypted(v) ? decryptField(v, key) : String(v);
      }

      const result: SessionState = {
        cookies,
        localStorage,
        sessionStorage: state.sessionStorage as Record<string, string> || {},
        createdAt: typeof state.createdAt === "number" ? state.createdAt : Date.now(),
        lastUsedAt: Date.now(),
      };

      // 如果是旧格式（明文），自动升级为加密格式
      const hasPlaintext = state.cookies.some(
        (c: Record<string, unknown>) => typeof c.value === "string" && !isEncrypted(c.value),
      );
      if (hasPlaintext) {
        await this.save(profileName, result);
      } else {
        await fs.writeFile(filePath, JSON.stringify({
          ...result,
          lastUsedAt: Date.now(),
        }, null, 2), "utf-8");
      }

      return result;
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
    } catch (err) {
      new ConsoleLogger("warn").warn("删除会话文件失败", { err: (err as Error).message });
    }
  }
}
