import fs from "fs/promises";
import path from "path";
import fetch from "node-fetch";
import { ISessionManager, SessionState, AccountInfo, SessionValidation } from "../core/ports/ISessionManager";
import { BizError } from "../core/error/BizError";
import { ErrorCode } from "../core/error/ErrorCode";
import { encryptField, decryptField, isEncrypted, getMasterKey } from "../utils/crypto/confidential";
import { ConsoleLogger } from "./ConsoleLogger";

const SESSION_ROOT = path.resolve("./sessions");
const logger = new ConsoleLogger("warn");

/** 站点域名 → 会话验证策略 */
const VALIDATION_STRATEGIES: Record<string, { url: string; extract: (body: any) => boolean }> = {
  bilibili: {
    url: "https://api.bilibili.com/x/web-interface/nav",
    extract: (body: any) => body.code !== -101,
  },
  xiaohongshu: {
    url: "https://edith.xiaohongshu.com/api/sns/web/v2/user/me",
    extract: (body: any) => body.code === 0 && body.data?.user_id != null,
  },
  zhihu: {
    url: "https://www.zhihu.com/api/v4/me?include=email",
    extract: (_body: any) => true,
  },
};

interface DomainMeta {
  /** 轮换索引 — 下一个尝试的账号序号 */
  rotationIndex: number;
  /** 被标记为无效的账号集合 */
  invalidAccounts: string[];
}

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

  // ── 路径工具 ──

  /** 获取 domain 的目录路径 */
  private domainDir(domain: string): string {
    const safe = domain.replace(/[^a-zA-Z0-9_-]/g, "_");
    return path.join(SESSION_ROOT, safe);
  }

  /** 获取账号文件的路径 */
  private accountPath(domain: string, accountId: string): string {
    const safe = accountId.replace(/[^a-zA-Z0-9_-]/g, "_");
    return path.join(this.domainDir(domain), `${safe}.json`);
  }

  /** 获取 domain 元数据文件路径 */
  private metaPath(domain: string): string {
    return path.join(this.domainDir(domain), "_meta.json");
  }

  /** 解析 "{domain}:{accountId}" 格式 */
  private parseProfileName(name: string): { domain: string; accountId: string } {
    const colon = name.indexOf(":");
    if (colon > 0) {
      return { domain: name.slice(0, colon), accountId: name.slice(colon + 1) };
    }
    // 旧格式（无冒号）当作 domain 名，账号为 "main"
    return { domain: name, accountId: "main" };
  }

  // ── 元数据读写 ──

  private async readMeta(domain: string): Promise<DomainMeta> {
    try {
      const raw = await fs.readFile(this.metaPath(domain), "utf-8");
      return JSON.parse(raw) as DomainMeta;
    } catch {
      return { rotationIndex: 0, invalidAccounts: [] };
    }
  }

  private async writeMeta(domain: string, meta: DomainMeta): Promise<void> {
    await fs.mkdir(this.domainDir(domain), { recursive: true });
    await fs.writeFile(this.metaPath(domain), JSON.stringify(meta, null, 2), "utf-8");
  }

  // ── 向后兼容：迁移旧格式 ──

  private async migrateLegacy(oldName: string): Promise<boolean> {
    const newDir = path.join(SESSION_ROOT, oldName.replace(/[^a-zA-Z0-9_-]/g, "_"));
    const oldFile = path.join(SESSION_ROOT, `${oldName.replace(/[^a-zA-Z0-9_-]/g, "_")}.session.json`);

    try {
      await fs.access(oldFile);
    } catch {
      return false; // 旧文件不存在
    }
    // 检查是否已迁移
    try {
      await fs.access(newDir);
      return false; // 新目录已存在
    } catch {}

    // 执行迁移
    await fs.mkdir(newDir, { recursive: true });
    await fs.rename(oldFile, path.join(newDir, "main.json"));
    await this.writeMeta(oldName, { rotationIndex: 0, invalidAccounts: [] });
    logger.info(`已迁移旧会话文件 ${oldFile} → ${newDir}/main.json`);
    return true;
  }

  // ── ISessionManager 实现 ──

  async save(profileName: string, state: SessionState, merge?: boolean): Promise<void> {
    const { domain, accountId } = this.parseProfileName(profileName);
    const filePath = this.accountPath(domain, accountId);
    state.lastUsedAt = Date.now();

    // 合并模式：保留已有 Cookie 中未被新数据覆盖的条目（如 a1、web_session）
    let mergedState: SessionState = state;
    if (merge) {
      const existing = await this.load(profileName);
      if (existing) {
        mergedState = this.mergeCookieState(existing, state);
      }
    }

    try {
      const key = await this.getMasterKey();
      const encrypted = {
        ...mergedState,
        cookies: mergedState.cookies.map((c) => ({
          ...c,
          value: encryptField(c.value, key),
        })),
        localStorage: Object.fromEntries(
          Object.entries(mergedState.localStorage).map(([k, v]) => [k, encryptField(v, key)]),
        ),
      };
      await fs.mkdir(this.domainDir(domain), { recursive: true });
      await fs.writeFile(filePath, JSON.stringify(encrypted, null, 2), "utf-8");
    } catch (err) {
      throw new BizError(ErrorCode.FS_WRITE_FAILED, `会话保存失败：${(err as Error).message}`);
    }
  }

  /**
   * 合并两份 Cookie 状态：新 cookie 覆盖已有；已有但不在此次的 cookie 保持原样。
   * 匹配依据：name + domain + path 三元组。
   */
  private mergeCookieState(existing: SessionState, incoming: SessionState): SessionState {
    const oldCookies = new Map(
      existing.cookies.map((c) => [`${c.name}|${c.domain}|${c.path}`, c]),
    );
    for (const c of incoming.cookies) {
      const key = `${c.name}|${c.domain}|${c.path}`;
      if (c.value) {
        // 新值非空 → 覆盖
        oldCookies.set(key, c);
      } else if (!oldCookies.has(key)) {
        // 新值为空但旧值不存在 → 仍添加（空值也比没有好）
        oldCookies.set(key, c);
      }
      // 新值为空且旧值存在 → 保留旧值（不覆盖）
    }
    return {
      ...incoming,
      cookies: Array.from(oldCookies.values()),
      lastUsedAt: Date.now(),
    };
  }

  async load(profileName: string): Promise<SessionState | null> {
    const { domain, accountId } = this.parseProfileName(profileName);
    await this.migrateLegacy(domain);
    const filePath = this.accountPath(domain, accountId);
    return this.readSessionFile(filePath);
  }

  private async readSessionFile(filePath: string): Promise<SessionState | null> {
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      const state = JSON.parse(raw) as SessionState & { cookies: Array<Record<string, unknown>> };
      const key = await this.getMasterKey();

      const cookies = state.cookies.map((c: Record<string, unknown>) => ({
        name: String(c.name),
        value: typeof c.value === "string" && isEncrypted(c.value) ? decryptField(c.value, key) : String(c.value),
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

      return {
        cookies,
        localStorage,
        sessionStorage: (state.sessionStorage as Record<string, string>) || {},
        createdAt: typeof state.createdAt === "number" ? state.createdAt : Date.now(),
        lastUsedAt: Date.now(),
      };
    } catch {
      return null;
    }
  }

  async listProfiles(): Promise<string[]> {
    await this.ensureDir();
    const profiles: string[] = [];
    const entries = await fs.readdir(SESSION_ROOT, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const dirPath = path.join(SESSION_ROOT, entry.name);
        const files = await fs.readdir(dirPath);
        for (const f of files) {
          if (f.endsWith(".json") && f !== "_meta.json") {
            const accountId = f.replace(".json", "");
            profiles.push(`${entry.name}:${accountId}`);
          }
        }
      } else if (entry.name.endsWith(".session.json")) {
        // 兼容旧格式（迁移前）
        profiles.push(entry.name.replace(".session.json", ""));
      }
    }
    return profiles;
  }

  async deleteProfile(profileName: string): Promise<void> {
    const { domain, accountId } = this.parseProfileName(profileName);
    const filePath = this.accountPath(domain, accountId);
    try {
      await fs.unlink(filePath);
    } catch (err) {
      logger.warn("删除会话文件失败", { err: (err as Error).message });
    }
  }

  // ── 多账号 ──

  async getSession(domain: string, accountId?: string): Promise<{ state: SessionState; accountId: string } | null> {
    await this.migrateLegacy(domain);

    if (accountId) {
      const state = await this.load(`${domain}:${accountId}`);
      if (state) return { state, accountId };
      return null;
    }

    // 轮换模式：找到下一个可用的账号
    const meta = await this.readMeta(domain);
    const accounts = await this.listAccountIds(domain);
    if (accounts.length === 0) return null;

    const validAccounts = accounts.filter((a) => !meta.invalidAccounts.includes(a));
    if (validAccounts.length === 0) return null;

    // 轮换
    if (meta.rotationIndex >= validAccounts.length) meta.rotationIndex = 0;
    const selected = validAccounts[meta.rotationIndex];
    meta.rotationIndex = (meta.rotationIndex + 1) % validAccounts.length;
    await this.writeMeta(domain, meta);

    const state = await this.load(`${domain}:${selected}`);
    if (state) return { state, accountId: selected };
    return null;
  }

  async listAccounts(domain: string): Promise<AccountInfo[]> {
    await this.migrateLegacy(domain);
    const meta = await this.readMeta(domain);
    const ids = await this.listAccountIds(domain);
    const result: AccountInfo[] = [];

    for (const id of ids) {
      const state = await this.load(`${domain}:${id}`);
      if (state) {
        result.push({
          accountId: id,
          valid: !meta.invalidAccounts.includes(id),
          createdAt: state.createdAt,
          lastUsedAt: state.lastUsedAt,
          cookieCount: state.cookies.length,
        });
      }
    }
    return result;
  }

  async getNextActiveAccount(domain: string): Promise<string | null> {
    await this.migrateLegacy(domain);
    const meta = await this.readMeta(domain);
    const accounts = await this.listAccountIds(domain);
    const valid = accounts.filter((a) => !meta.invalidAccounts.includes(a));
    if (valid.length === 0) return null;
    if (meta.rotationIndex >= valid.length) meta.rotationIndex = 0;
    const selected = valid[meta.rotationIndex];
    meta.rotationIndex = (meta.rotationIndex + 1) % valid.length;
    await this.writeMeta(domain, meta);
    return selected;
  }

  async markInvalid(domain: string, accountId: string): Promise<void> {
    const meta = await this.readMeta(domain);
    if (!meta.invalidAccounts.includes(accountId)) {
      meta.invalidAccounts.push(accountId);
    }
    await this.writeMeta(domain, meta);
  }

  async resetInvalidAccount(domain: string, accountId: string): Promise<void> {
    const meta = await this.readMeta(domain);
    meta.invalidAccounts = meta.invalidAccounts.filter((a) => a !== accountId);
    await this.writeMeta(domain, meta);
  }

  /** 获取 domain 下所有账号 ID 列表。 */
  private async listAccountIds(domain: string): Promise<string[]> {
    const dir = this.domainDir(domain);
    try {
      const files = await fs.readdir(dir);
      return files
        .filter((f) => f.endsWith(".json") && f !== "_meta.json")
        .map((f) => f.replace(".json", ""))
        .sort();
    } catch {
      return [];
    }
  }

  // ── 会话验证 ──

  async validateSession(profileName: string): Promise<SessionValidation> {
    const { domain, accountId } = this.parseProfileName(profileName);
    const session = await this.load(profileName);
    if (!session) {
      return { valid: false, detail: `配置 [${profileName}] 不存在` };
    }

    const domains = session.cookies.map((c) => c.domain).filter(Boolean);
    const biliDomain = domains.find((d) => d.includes("bilibili.com"));
    const xhsDomain = domains.find((d) => d.includes("xiaohongshu.com"));
    const zhihuDomain = domains.find((d) => d.includes("zhihu.com"));

    const matchingDomain = biliDomain || xhsDomain || zhihuDomain;
    if (!matchingDomain) {
      return { valid: true, detail: "未匹配到已知站点验证策略，跳过验证" };
    }

    let strategyKey: string | null = null;
    if (biliDomain) strategyKey = "bilibili";
    else if (xhsDomain) strategyKey = "xiaohongshu";
    else if (zhihuDomain) strategyKey = "zhihu";

    if (!strategyKey) {
      return { valid: true, detail: `站点 ${matchingDomain} 无验证策略，跳过验证` };
    }

    const strategy = VALIDATION_STRATEGIES[strategyKey];
    const cookieStr = session.cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    try {
      const res = await fetch(strategy.url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
          "Cookie": cookieStr,
          "Referer": "https://www.bilibili.com/",
        },
      });

      if (strategyKey === "zhihu") {
        if (res.status === 401) {
          await this.markInvalid(domain, accountId);
          return { valid: false, detail: "知乎 Cookie 已过期 (HTTP 401)" };
        }
        const body = await res.json() as any;
        return { valid: true, detail: `知乎用户: ${body?.data?.name || body?.name || "未知"}` };
      }

      const body = await res.json() as any;
      const valid = strategy.extract(body);

      if (valid) {
        let detail = `✅ ${strategyKey === "bilibili" ? "B站" : "小红书"} 会话有效`;
        if (strategyKey === "bilibili" && body.data?.uname) detail += ` (${body.data.uname})`;
        if (strategyKey === "xiaohongshu" && body.data?.nickname) detail += ` (${body.data.nickname})`;
        return { valid: true, detail };
      }

      await this.markInvalid(domain, accountId);
      return { valid: false, detail: `${strategyKey === "bilibili" ? "B站" : "小红书"} Cookie 已过期 (code=${body.code})` };
    } catch (e: any) {
      return { valid: false, detail: `验证请求失败: ${e.message}` };
    }
  }
}
