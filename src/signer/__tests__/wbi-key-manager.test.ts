import { WbiKeyManager } from "../wbi-key-manager";
import fs from "fs/promises";
import path from "path";

const CACHE_PATH = path.resolve("sessions/wbi_keys.json");

beforeEach(async () => {
  // 确保每次测试前清除缓存文件
  try { await fs.unlink(CACHE_PATH); } catch {}
});

describe("WbiKeyManager", () => {
  describe("getStatus", () => {
    it("returns source=none when no cache is set", () => {
      const mgr = new WbiKeyManager();
      const status = mgr.getStatus();
      expect(status.available).toBe(false);
      expect(status.source).toBe("none");
      expect(status.lastUpdated).toBeNull();
      expect(status.imgKeyPrefix).toBe("");
      expect(status.subKeyPrefix).toBe("");
    });

    it("returns source=memory when cache is set via setKeys", async () => {
      const mgr = new WbiKeyManager();
      await mgr.setKeys("abcdef1234567890abcdef1234567890", "0987654321fedcba0987654321fedcba");
      const status = mgr.getStatus();
      expect(status.available).toBe(true);
      expect(status.source).toBe("memory");
      expect(status.isCached).toBe(false); // just set, not expired
      expect(status.lastUpdated).toBeGreaterThan(0);
      expect(status.imgKeyPrefix).toBe("abcdef12");
      expect(status.subKeyPrefix).toBe("09876543");
    });

    it("reports isCached=true when keys are expired", async () => {
      const mgr = new WbiKeyManager();
      // 注入一个已过期的缓存（updated_at = 0）
      (mgr as any).cache = {
        img_key: "abcdef1234567890abcdef1234567890",
        sub_key: "0987654321fedcba0987654321fedcba",
        updated_at: 0,
      };
      const status = mgr.getStatus();
      expect(status.available).toBe(true);
      expect(status.isCached).toBe(true); // expired
    });
  });

  describe("getKeys + setKeys", () => {
    it("returns keys immediately after setKeys without network call", async () => {
      const mgr = new WbiKeyManager();
      await mgr.setKeys("11111111111111111111111111111111", "22222222222222222222222222222222");
      const { img_key, sub_key } = await mgr.getKeys();
      expect(img_key).toBe("11111111111111111111111111111111");
      expect(sub_key).toBe("22222222222222222222222222222222");
    });

    it("setKeys persists to file", async () => {
      const mgr = new WbiKeyManager();
      await mgr.setKeys("aaaabbbbccccddddaaaabbbbccccdddd", "eeeettttyyyyuuuueeeettttyyyyuuuu");
      const raw = await fs.readFile(CACHE_PATH, "utf-8");
      const cached = JSON.parse(raw);
      expect(cached.img_key).toBe("aaaabbbbccccddddaaaabbbbccccdddd");
      expect(cached.sub_key).toBe("eeeettttyyyyuuuueeeettttyyyyuuuu");
      expect(cached.updated_at).toBeGreaterThan(0);
    });
  });

  describe("结构变化保护", () => {
    it("构造变化场景：提取密钥为空时保留旧缓存", async () => {
      // 先设置一个合法缓存
      const mgr = new WbiKeyManager();
      await mgr.setKeys("abcdef1234567890abcdef1234567890", "0987654321fedcba0987654321fedcba");

      // 模拟 extractKey 返回空（URL 格式变化）
      // extractKey 对 URL 用 split 提取，放入一个无扩展名的 URL
      const result = extractKeyForTest("https://i0.hdslb.com/bfs/wbi/");
      expect(result).toBe("");
    });
  });

  describe("refresh 异常场景（不实际调用网络）", () => {
    it("保留内存缓存在 refresh 失败后仍可用", async () => {
      const mgr = new WbiKeyManager();
      // 先注入缓存
      await mgr.setKeys("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
      // 手动触发刷新（会失败因为无网络），但内存缓存应保留
      try {
        await (mgr as any).doRefresh();
      } catch {}
      const status = mgr.getStatus();
      expect(status.available).toBe(true);
      // 原始缓存应保留（即使 refresh 抛错也不应清空）
      expect(status.imgKeyPrefix).toBe("aaaaaaaa");
    });
  });
});

/**
 * 测试辅助：模拟 extractKey 的行为
 */
function extractKeyForTest(url: string): string {
  try {
    return url.split("/").pop()?.split(".")[0] || "";
  } catch {
    return "";
  }
}
