import { isValidUrl, ensureValidUrl, filterEmptySelectors } from "./validator";
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

// resolveUrl and safeRegExp removed — no production usage
