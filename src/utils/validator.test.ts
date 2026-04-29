import { isValidUrl, ensureValidUrl, safeRegExp, filterEmptySelectors, resolveUrl } from "./validator";
import { BizError } from "../core/error/BizError";

describe("isValidUrl", () => {
  it("returns true for valid http URL", () => {
    expect(isValidUrl("https://example.com")).toBe(true);
  });

  it("returns true for valid https URL", () => {
    expect(isValidUrl("https://example.com/path?q=1")).toBe(true);
  });

  it("returns false for empty string", () => {
    expect(isValidUrl("")).toBe(false);
  });

  it("returns false for random text", () => {
    expect(isValidUrl("not-a-url")).toBe(false);
  });

  it("returns false for whitespace", () => {
    expect(isValidUrl("   ")).toBe(false);
  });
});

describe("ensureValidUrl", () => {
  it("does not throw for valid URL", () => {
    expect(() => ensureValidUrl("https://example.com")).not.toThrow();
  });

  it("throws BizError for invalid URL", () => {
    expect(() => ensureValidUrl("bad")).toThrow(BizError);
  });
});

describe("safeRegExp", () => {
  it("returns RegExp for valid pattern", () => {
    const re = safeRegExp("hello");
    expect(re).toBeInstanceOf(RegExp);
    expect(re!.test("hello world")).toBe(true);
  });

  it("returns null for invalid pattern", () => {
    expect(safeRegExp("(")).toBeNull();
  });

  it("uses default flags 'gi'", () => {
    const re = safeRegExp("test")!;
    expect(re.flags).toBe("gi");
  });

  it("accepts custom flags", () => {
    const re = safeRegExp("test", "i")!;
    expect(re.flags).toBe("i");
  });
});

describe("filterEmptySelectors", () => {
  it("returns non-empty strings", () => {
    expect(filterEmptySelectors(["#id", ".class"])).toEqual(["#id", ".class"]);
  });

  it("filters out empty strings", () => {
    expect(filterEmptySelectors(["#id", "", "  ", ".cls"])).toEqual(["#id", ".cls"]);
  });

  it("returns empty array for all empty input", () => {
    expect(filterEmptySelectors(["", " "])).toEqual([]);
  });

  it("returns empty array for empty input", () => {
    expect(filterEmptySelectors([])).toEqual([]);
  });
});

describe("resolveUrl", () => {
  it("joins base and path", () => {
    expect(resolveUrl("https://example.com", "api/users")).toBe("https://example.com/api/users");
  });

  it("handles trailing slash on base", () => {
    expect(resolveUrl("https://example.com/", "api/users")).toBe("https://example.com/api/users");
  });

  it("handles leading slash on path", () => {
    expect(resolveUrl("https://example.com", "/api/users")).toBe("https://example.com/api/users");
  });

  it("handles both slashes", () => {
    expect(resolveUrl("https://example.com/", "/api/users")).toBe("https://example.com/api/users");
  });
});
