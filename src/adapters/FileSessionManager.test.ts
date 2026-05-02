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
    it("writes encrypted state as JSON to the session file", async () => {
      await mgr.save("my-profile", sampleState());
      const call = mockedFs.writeFile.mock.calls[0];
      expect(call[0]).toContain("my-profile.session.json");
      const written = JSON.parse(call[1] as string);
      expect(isEncrypted(written.localStorage.token)).toBe(true);
      expect(isEncrypted(written.cookies[0].value)).toBe(true);
    });

    it("updates lastUsedAt before writing", async () => {
      const state = sampleState();
      const before = state.lastUsedAt;
      await mgr.save("p", state);
      expect(state.lastUsedAt).toBeGreaterThanOrEqual(before);
    });

    it("throws BizError when write fails", async () => {
      mockedFs.writeFile.mockRejectedValue(new Error("disk full"));
      await expect(mgr.save("p", sampleState())).rejects.toThrow(BizError);
    });
  });

  describe("load", () => {
    it("returns decrypted state when file exists", async () => {
      // Pre-save encrypted state first via save
      await mgr.save("my-profile", sampleState());
      const call = mockedFs.writeFile.mock.calls[0];
      const encryptedContent = call[1] as string;

      // Now mock readFile to return the encrypted content
      mockedFs.readFile.mockResolvedValue(encryptedContent);
      const state = await mgr.load("my-profile");
      expect(state).not.toBeNull();
      expect(state!.localStorage.token).toBe("secret");
      expect(state!.cookies[0].name).toBe("sid");
      expect(state!.cookies[0].value).toBe("abc");
    });

    it("handles old plaintext format (auto-upgrade to encrypted)", async () => {
      mockedFs.readFile.mockResolvedValue(JSON.stringify(sampleState()));
      const state = await mgr.load("p");
      expect(state).not.toBeNull();
      expect(state!.localStorage.token).toBe("secret");
      // Should have re-saved as encrypted
      expect(mockedFs.writeFile).toHaveBeenCalled();
    });

    it("updates lastUsedAt and rewrites on load", async () => {
      await mgr.save("p", sampleState());
      const encryptedContent = mockedFs.writeFile.mock.calls[0][1] as string;
      mockedFs.readFile.mockResolvedValue(encryptedContent);

      const state = await mgr.load("p");
      expect(mockedFs.writeFile).toHaveBeenCalledTimes(2); // save + re-save on load
      expect(state!.lastUsedAt).toBeGreaterThan(1000);
    });

    it("returns null when file does not exist", async () => {
      mockedFs.readFile.mockRejectedValue(new Error("ENOENT"));
      const state = await mgr.load("nonexistent");
      expect(state).toBeNull();
    });

    it("returns null when JSON is invalid", async () => {
      mockedFs.readFile.mockResolvedValue("not json");
      const state = await mgr.load("bad");
      expect(state).toBeNull();
    });
  });

  describe("listProfiles", () => {
    it("returns profile names from .session.json files", async () => {
      mockedFs.readdir.mockResolvedValue(["a.session.json", "b.session.json", "readme.txt"] as any);
      const profiles = await mgr.listProfiles();
      expect(profiles).toEqual(["a", "b"]);
    });

    it("returns empty array when directory is empty", async () => {
      mockedFs.readdir.mockResolvedValue([] as any);
      const profiles = await mgr.listProfiles();
      expect(profiles).toEqual([]);
    });
  });

  describe("deleteProfile", () => {
    it("calls unlink with correct path", async () => {
      mockedFs.unlink.mockResolvedValue(undefined);
      await mgr.deleteProfile("my-profile");
      expect(mockedFs.unlink).toHaveBeenCalledWith(expect.stringContaining("my-profile.session.json"));
    });

    it("does not throw when file does not exist", async () => {
      mockedFs.unlink.mockRejectedValue(new Error("ENOENT"));
      await expect(mgr.deleteProfile("ghost")).resolves.toBeUndefined();
    });
  });

  describe("getProfilePath (via save)", () => {
    it("sanitizes profile name", async () => {
      await mgr.save("bad / name!", sampleState());
      const callPath = mockedFs.writeFile.mock.calls[0][0] as string;
      expect(callPath).toContain("bad___name_");
    });

    it("adds .session.json extension", async () => {
      await mgr.save("test", sampleState());
      const callPath = mockedFs.writeFile.mock.calls[0][0] as string;
      expect(callPath).toContain("test.session.json");
    });
  });
});
