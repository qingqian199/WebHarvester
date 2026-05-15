import fs from "fs/promises";
import path from "path";
import { ConsoleLogger } from "../adapters/ConsoleLogger";
import { getMixinKeyEncTabId } from "../utils/crypto/bilibili-signer";

export interface WbiKeyCache {
  img_key: string;
  sub_key: string;
  updated_at: number; // unix ms
}

export interface WbiKeyStatus {
  available: boolean;
  isCached: boolean;
  lastUpdated: number | null;
  source: "memory" | "file" | "fresh" | "none";
  imgKeyPrefix: string;
  subKeyPrefix: string;
}

const CACHE_PATH = path.resolve("sessions/wbi_keys.json");
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 分钟
const NAV_API = "https://api.bilibili.com/x/web-interface/nav";

/**
 * WBI 密钥管理器。
 *
 * 职责：
 * 1. 从 B站 nav 接口获取最新的 img_key / sub_key
 * 2. 缓存到 sessions/wbi_keys.json（30 分钟 TTL）
 * 3. 并发锁防止重复刷新
 * 4. 提供 setKeys() 方法供测试覆盖或手动注入
 */
export class WbiKeyManager {
  private logger: ConsoleLogger;
  private cache: WbiKeyCache | null = null;
  private refreshPromise: Promise<void> | null = null;

  constructor(logger?: ConsoleLogger) {
    this.logger = logger ?? new ConsoleLogger("info");
  }

  /**
   * 获取 WBI 密钥。
   * 优先返回内存缓存 → 文件缓存（未过期）→ 刷新。
   */
  async getKeys(): Promise<{ img_key: string; sub_key: string }> {
    // 1. 内存缓存
    if (this.cache && this.cache.updated_at + CACHE_TTL_MS > Date.now()) {
      return { img_key: this.cache.img_key, sub_key: this.cache.sub_key };
    }

    // 2. 文件缓存（未过期）
    if (!this.cache) {
      try {
        const raw = await fs.readFile(CACHE_PATH, "utf-8");
        const fileCache: WbiKeyCache = JSON.parse(raw);
        if (fileCache.img_key && fileCache.sub_key && fileCache.updated_at + CACHE_TTL_MS > Date.now()) {
          this.cache = fileCache;
          return { img_key: fileCache.img_key, sub_key: fileCache.sub_key };
        }
      } catch {}
    }

    // 3. 刷新（带并发锁）
    await this.refresh();
    if (!this.cache) {
      throw new Error("WBI 密钥不可用（nav 接口要求签名且无任何可用缓存）");
    }
    return { img_key: this.cache.img_key, sub_key: this.cache.sub_key };
  }

  /**
   * 手动注入密钥（用于测试覆写或管理接口）。
   * 同时更新内存缓存和文件缓存。
   */
  async setKeys(img_key: string, sub_key: string): Promise<void> {
    this.cache = { img_key, sub_key, updated_at: Date.now() };
    await this.saveCache();
  }

  /**
   * 获取当前密钥状态（用于健康检查和监控）。
   * 不会触发刷新，纯读取。
   */
  getStatus(): WbiKeyStatus {
    if (this.cache) {
      return {
        available: true,
        isCached: this.cache.updated_at + CACHE_TTL_MS < Date.now(),
        lastUpdated: this.cache.updated_at,
        source: "memory",
        imgKeyPrefix: this.cache.img_key.slice(0, 8),
        subKeyPrefix: this.cache.sub_key.slice(0, 8),
      };
    }
    return {
      available: false,
      isCached: false,
      lastUpdated: null,
      source: "none",
      imgKeyPrefix: "",
      subKeyPrefix: "",
    };
  }

  /**
   * 强制刷新密钥（供 -352 自动恢复或 MCP 工具调用）。
   * 带并发锁，防止多个请求同时刷新。
   */
  async refresh(): Promise<void> {
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = this.doRefresh().finally(() => {
      this.refreshPromise = null;
    });

    return this.refreshPromise;
  }

  private async doRefresh(): Promise<void> {
    this.logger.info("🔄 刷新 WBI 密钥...");

    const res = await fetch(NAV_API, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
        "Referer": "https://www.bilibili.com/",
      },
    });

    if (!res.ok) {
      throw new Error(`nav 接口返回 ${res.status}`);
    }

    const body: any = await res.json();

    // 保护：nav 接口也要求 WBI 签名（code -352）——死循环场景
    if (body.code === -352) {
      this.logger.warn("⚠️ nav 接口要求签名，密钥刷新失败，使用旧密钥");
      // 优先保留内存中的旧缓存（即使已过期）
      if (this.cache) return;
      // 尝试从文件恢复过期缓存
      try {
        const raw = await fs.readFile(CACHE_PATH, "utf-8");
        const fileCache: WbiKeyCache = JSON.parse(raw);
        if (fileCache.img_key && fileCache.sub_key) {
          this.cache = fileCache;
          this.logger.info("✅ 已从文件加载过期密钥继续工作");
          return;
        }
      } catch {}
      // 无任何可用缓存：不抛错，让 getKeys 处理降级
      this.logger.error("❌ 无可用 WBI 密钥缓存，后续 WBI 签名请求将降级到无签名端点");
      return;
    }

    if (body.code !== 0 || !body.data?.wbi_img) {
      this.logger.error(`⚠️ nav 接口返回异常: code=${body.code}, 无 wbi_img 字段`);
      this.logger.error(`📦 原始 nav 响应: ${JSON.stringify(body).slice(0, 1000)}`);
      if (this.cache) {
        this.logger.warn("♻️ 保留旧缓存密钥继续工作");
        return;
      }
      try {
        const raw = await fs.readFile(CACHE_PATH, "utf-8");
        const fileCache: WbiKeyCache = JSON.parse(raw);
        if (fileCache.img_key && fileCache.sub_key) {
          this.cache = fileCache;
          this.logger.info("✅ 已从文件恢复过期密钥继续工作");
          return;
        }
      } catch {}
      throw new Error(`nav 接口业务异常: ${JSON.stringify(body)}`);
    }

    const imgUrl: string = body.data.wbi_img.img_url || "";
    const subUrl: string = body.data.wbi_img.sub_url || "";

    // 结构变化检测：字段名或嵌套层级改变导致提取为空
    if (!imgUrl || !subUrl) {
      this.logger.error("⚠️ nav 响应结构异常：wbi_img 字段为空或已改名");
      this.logger.error(`📦 原始 nav 响应: ${JSON.stringify(body).slice(0, 1000)}`);
      if (this.cache) {
        this.logger.warn("♻️ 保留旧缓存密钥继续工作");
        return;
      }
      try {
        const raw = await fs.readFile(CACHE_PATH, "utf-8");
        const fileCache: WbiKeyCache = JSON.parse(raw);
        if (fileCache.img_key && fileCache.sub_key) {
          this.cache = fileCache;
          this.logger.info("✅ 已从文件恢复过期密钥继续工作");
          return;
        }
      } catch {}
      throw new Error(`nav 接口未返回 wbi_img 字段: ${JSON.stringify(body).slice(0, 500)}`);
    }

    const img_key = extractKey(imgUrl);
    const sub_key = extractKey(subUrl);

    // 结构变化检测：URL 格式改变导致提取失败
    if (!img_key || !sub_key || img_key.length !== 32 || sub_key.length !== 32) {
      this.logger.error("⚠️ WBI 密钥提取失败：URL 格式可能已变化");
      this.logger.error(`📦 原始 img_url: ${imgUrl}`);
      this.logger.error(`📦 原始 sub_url: ${subUrl}`);
      this.logger.error(`📦 完整 nav 响应: ${JSON.stringify(body).slice(0, 1000)}`);
      if (this.cache) {
        this.logger.warn("♻️ 保留旧缓存密钥继续工作");
        return;
      }
      try {
        const raw = await fs.readFile(CACHE_PATH, "utf-8");
        const fileCache: WbiKeyCache = JSON.parse(raw);
        if (fileCache.img_key && fileCache.sub_key) {
          this.cache = fileCache;
          this.logger.info("✅ 已从文件恢复过期密钥继续工作");
          return;
        }
      } catch {}
      throw new Error(`WBI 密钥格式异常: img=${img_key?.length ?? 0}, sub=${sub_key?.length ?? 0}, 原始 body=${JSON.stringify(body).slice(0, 500)}`);
    }

    this.cache = { img_key, sub_key, updated_at: Date.now() };
    await this.saveCache();

    const tabId = getMixinKeyEncTabId();
    this.logger.info(`✅ WBI 密钥已刷新: img_key=${img_key.slice(0, 8)}..., sub_key=${sub_key.slice(0, 8)}..., tab_id=${tabId.slice(0, 12)}...`);
  }

  private async saveCache(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(CACHE_PATH), { recursive: true });
      await fs.writeFile(CACHE_PATH, JSON.stringify(this.cache, null, 2), "utf-8");
    } catch (e) {
      this.logger.warn(`WBI 密钥缓存写入失败: ${(e as Error).message}`);
    }
  }
}

/** 从 URL 中提取密钥：https://i0.hdslb.com/bfs/wbi/abc123.png → abc123 */
function extractKey(url: string): string {
  try {
    return url.split("/").pop()?.split(".")[0] || "";
  } catch {
    return "";
  }
}
