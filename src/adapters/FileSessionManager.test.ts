import fs from "fs/promises";
import { FileSessionManager } from "./FileSessionManager";
import { SessionState } from "../core/ports/ISessionManager";
import { BizError } from "../core/error/BizError";
import { isEncrypted } from "../utils/crypto/confidential";

jest.mock("fs/promises");
const mockedFs = fs as jest.Mocked<typeof fs>;

const MASTER_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function sampleState(): SessionState {
  return {
    cookies: [{ name: "sid", value: "abc", domain: ".ex.com" }],
    localStorage: { token: "secret" },
    sessionStorage: {},
    createdAt: 1000,
    lastUsedAt: 1000,
  };
}

describe("FileSessionManager", () => {
  let mgr: FileSessionManager;

  beforeAll(() => {
    process.env.WEBHARVESTER_MASTER_KEY = MASTER_KEY;
  });

  afterAll(() => {
    delete process.env.WEBHARVESTER_MASTER_KEY;
  });

  beforeEach(() => {
    jest.resetAllMocks();
    mockedFs.mkdir.mockResolvedValue(undefined);
    mockedFs.writeFile.mockResolvedValue(undefined);
    mockedFs.readdir.mockResolvedValue([] as any);
    mgr = new FileSessionManager();
  });

  describe("save", () => {
    it("writes encrypted state to domain/accountId.json", async () => {
      await mgr.save("bilibili:main", sampleState());
      const call = mockedFs.writeFile.mock.calls[0];
      expect(call[0]).toContain("bilibili");
      expect(call[0]).toContain("main.json");
      const written = JSON.parse(call[1] as string);
      expect(isEncrypted(written.localStorage.token)).toBe(true);
      expect(isEncrypted(written.cookies[0].value)).toBe(true);
    });

    it("accepts old format (domain only) as domain:main", async () => {
      await mgr.save("my-profile", sampleState());
      const call = mockedFs.writeFile.mock.calls[0];
      // Old format: no colon → stored in my-profile/main.json
      expect(call[0]).toContain("my-profile");
      expect(call[0]).toContain("main.json");
    });

    it("updates lastUsedAt before writing", async () => {
      const state = sampleState();
      const before = state.lastUsedAt;
      await mgr.save("d:a", state);
      expect(state.lastUsedAt).toBeGreaterThanOrEqual(before);
    });

    it("throws BizError when write fails", async () => {
      mockedFs.writeFile.mockRejectedValue(new Error("disk full"));
      await expect(mgr.save("d:a", sampleState())).rejects.toThrow(BizError);
    });
  });

  describe("load", () => {
    it("returns decrypted state when file exists", async () => {
      await mgr.save("d:main", sampleState());
      const call = mockedFs.writeFile.mock.calls[0];
      const encryptedContent = call[1] as string;
      mockedFs.readFile.mockResolvedValue(encryptedContent);

      const state = await mgr.load("d:main");
      expect(state).not.toBeNull();
      expect(state!.localStorage.token).toBe("secret");
      expect(state!.cookies[0].name).toBe("sid");
      expect(state!.cookies[0].value).toBe("abc");
    });

    it("returns null when file does not exist", async () => {
      mockedFs.readFile.mockRejectedValue(new Error("ENOENT"));
      const state = await mgr.load("nonexistent:main");
      expect(state).toBeNull();
    });
  });

  describe("listProfiles", () => {
    it("returns profiles in domain:accountId format from directories", async () => {
      // 模拟目录结构：一个目录(bilibili) + 一个旧格式文件
      mockedFs.readdir.mockImplementation(async (p: any) => {
        const pStr = String(p);
        if (pStr.includes("bilibili")) return ["main.json", "alt.json"] as any;
        if (pStr.includes("sessions")) return [{ name: "bilibili", isDirectory: () => true }, { name: "old.session.json", isDirectory: () => false }] as any;
        return [];
      });
      const profiles = await mgr.listProfiles();
      expect(profiles).toContain("bilibili:main");
      expect(profiles).toContain("bilibili:alt");
      expect(profiles).toContain("old");
    });
  });

  describe("getSession (rotation)", () => {
    it("returns null when no accounts exist", async () => {
      mockedFs.readdir.mockResolvedValue([] as any);
      const result = await mgr.getSession("bilibili");
      expect(result).toBeNull();
    });
  });

  describe("markInvalid / resetInvalidAccount", () => {
    it("persists invalid accounts in meta", async () => {
      await mgr.markInvalid("bilibili", "alt");
      const metaCall = mockedFs.writeFile.mock.calls.find((c: any) =>
        String(c[0]).includes("_meta.json"),
      );
      expect(metaCall).toBeDefined();
      const meta = JSON.parse(metaCall![1] as string);
      expect(meta.invalidAccounts).toContain("alt");

      await mgr.resetInvalidAccount("bilibili", "alt");
      const resetCall = mockedFs.writeFile.mock.calls.find((c: any) =>
        String(c[0]).includes("_meta.json") && c !== metaCall,
      );
      const meta2 = JSON.parse(resetCall![1] as string);
      expect(meta2.invalidAccounts).not.toContain("alt");
    });
  });

  describe("validateSession", () => {
    it("returns invalid when profile does not exist", async () => {
      mockedFs.readFile.mockRejectedValue(new Error("ENOENT"));
      const result = await mgr.validateSession("bilibili:main");
      expect(result.valid).toBe(false);
    });
  });
});
