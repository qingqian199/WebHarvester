import { generateZse96, generateApiVersion } from "../zhihu-signer";

describe("generateZse96", () => {
  it("returns a string starting with 2.0_", () => {
    const result = generateZse96("/api/v4/me");
    expect(result).toMatch(/^2\.0_.+/);
  });

  it("returns different outputs for different paths", () => {
    const a = generateZse96("/api/v4/me");
    const b = generateZse96("/api/v4/members/test");
    expect(a).not.toBe(b);
  });

  it("includes query params in the hash", () => {
    const withParams = generateZse96("/api/v4/me", "include=email");
    const withoutParams = generateZse96("/api/v4/me");
    expect(withParams).not.toBe(withoutParams);
  });

  it("produces consistent output for same input", () => {
    const a = generateZse96("/api/v4/me", "include=email");
    const b = generateZse96("/api/v4/me", "include=email");
    expect(a).toBe(b);
  });
});

describe("generateApiVersion", () => {
  it("returns a version string", () => {
    expect(generateApiVersion()).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
