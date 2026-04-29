import { extractAuthHeaders, extractAuthStorage } from "./auth-rule";

describe("extractAuthHeaders", () => {
  it("extracts authorization header", () => {
    const headers = { authorization: "Bearer xxx", "content-type": "application/json" };
    expect(extractAuthHeaders(headers)).toEqual({ authorization: "Bearer xxx" });
  });

  it("extracts x-token header", () => {
    const headers = { "x-token": "abc123", "x-request-id": "456" };
    expect(extractAuthHeaders(headers)).toEqual({ "x-token": "abc123" });
  });

  it("extracts multiple auth headers", () => {
    const headers = { authorization: "Bearer tok", "x-access-token": "secret", "x-csrf-token": "csrf" };
    const result = extractAuthHeaders(headers);
    expect(Object.keys(result)).toHaveLength(3);
  });

  it("is case-insensitive", () => {
    const headers = { Authorization: "Bearer xxx" };
    expect(extractAuthHeaders(headers)).toEqual({ Authorization: "Bearer xxx" });
  });

  it("returns empty object when no auth headers present", () => {
    const headers = { "content-type": "text/html" };
    expect(extractAuthHeaders(headers)).toEqual({});
  });

  it("returns empty object for empty input", () => {
    expect(extractAuthHeaders({})).toEqual({});
  });

  it("ignores non-auth headers", () => {
    const headers = { "content-type": "application/json", "x-request-id": "abc" };
    expect(extractAuthHeaders(headers)).toEqual({});
  });
});

describe("extractAuthStorage", () => {
  it("extracts shallow token fields", () => {
    const storage = { token: "abc123", theme: "dark" };
    expect(extractAuthStorage(storage)).toEqual({ token: "abc123" });
  });

  it("extracts nested JSON tokens", () => {
    const storage = { user: JSON.stringify({ access_token: "secret", name: "test" }) };
    const result = extractAuthStorage(storage);
    expect(result["user.access_token"]).toBe("secret");
  });

  it("extracts both shallow and nested tokens", () => {
    const storage = {
      session: JSON.stringify({ jwt: "eyJhbGci" }),
      refresh_token: "rtoken",
    };
    const result = extractAuthStorage(storage);
    expect(result["session.jwt"]).toBe("eyJhbGci");
    expect(result.refresh_token).toBe("rtoken");
  });

  it("handles deeply nested objects", () => {
    const storage = {
      auth: JSON.stringify({ user: { token: { access: "deep-secret" } } }),
    };
    const result = extractAuthStorage(storage);
    expect(result["auth.user.token.access"]).toBe("deep-secret");
  });

  it("returns empty object for empty input", () => {
    expect(extractAuthStorage({})).toEqual({});
  });

  it("ignores non-matching keys in non-json strings", () => {
    const storage = { name: "test", count: "42" };
    expect(extractAuthStorage(storage)).toEqual({});
  });

  it("handles invalid JSON gracefully", () => {
    const storage = { config: "{invalid json}" };
    expect(extractAuthStorage(storage)).toEqual({});
  });

  it("handles parsed JSON that is not an object", () => {
    const storage = { config: JSON.stringify("just a string") };
    expect(extractAuthStorage(storage)).toEqual({});
  });

  it("handles parsed JSON that is a number", () => {
    const storage = { count: JSON.stringify(42) };
    expect(extractAuthStorage(storage)).toEqual({});
  });
});
