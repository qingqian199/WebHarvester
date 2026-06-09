import { describe, it, expect, afterEach, beforeAll } from "@jest/globals";

import { SignerRegistry } from "../signer-registry";
import { registerAllSigners } from "../signer-adapters";
import type { ISigner } from "../signer-registry";

class MockSigner implements ISigner {
  name = "mock";
  async sign(params: Record<string, unknown>): Promise<Record<string, string>> {
    return { signed: `mock_${params.input}` };
  }
}

beforeAll(() => {
  registerAllSigners();
});

describe("SignerRegistry", () => {
  afterEach(() => {
    try {
      (SignerRegistry as any).signers.delete("mock");
    } catch {} // ok: ignored
    try {
      (SignerRegistry as any).aliases.delete("mock-alias");
    } catch {} // ok: ignored
  });

  it("registers and retrieves a signer", () => {
    const s = new MockSigner();
    SignerRegistry.register(s, "mock-alias");
    expect(SignerRegistry.get("mock")?.name).toBe("mock");
    expect(SignerRegistry.get("mock-alias")?.name).toBe("mock");
  });
  it("returns null for unknown signer", () => {
    expect(SignerRegistry.get("nonexistent")).toBeNull();
  });
  it("lists all registered signers", () => {
    const names = SignerRegistry.list();
    expect(names).toContain("wbi");
    expect(names).toContain("x-s");
    expect(names).toContain("zse-96");
    expect(names).toContain("ds");
  });
  it("resolves aliases correctly", () => {
    expect(SignerRegistry.get("bilibili")?.name).toBe("wbi");
    expect(SignerRegistry.get("xiaohongshu")?.name).toBe("x-s");
    expect(SignerRegistry.get("zhihu")?.name).toBe("zse-96");
  });
  it("Noop signer returns empty", async () => {
    const s = SignerRegistry.get("none");
    expect(Object.keys(await s!.sign({}))).toHaveLength(0);
  });
});
