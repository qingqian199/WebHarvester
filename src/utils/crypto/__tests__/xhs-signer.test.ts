import { md5, customBase64Encode, customBase64Decode, xxteaEncrypt, xxteaDecrypt, mnsv2, generateXsHeader } from "../xhs-signer";

describe("md5", () => {
  it("produces correct hash for empty string", () => {
    expect(md5("")).toBe("d41d8cd98f00b204e9800998ecf8427e");
  });

  it("produces correct hash for known input", () => {
    expect(md5("hello")).toBe("5d41402abc4b2a76b9719d911017c592");
  });

  it("produces 32-character hex string", () => {
    expect(md5("any string").length).toBe(32);
  });
});

describe("customBase64", () => {
  it("encodes and decodes back to original", () => {
    const original = Buffer.from("Hello, 小红书!");
    const encoded = customBase64Encode(original);
    const decoded = customBase64Decode(encoded);
    expect(Buffer.from(decoded).toString("utf-8")).toBe("Hello, 小红书!");
  });

  it("produces non-standard output (differs from regular base64)", () => {
    const data = Buffer.from("test");
    const encoded = customBase64Encode(data);
    const standard = data.toString("base64");
    expect(encoded).not.toBe(standard);
  });

  it("encoded string only contains custom alphabet chars", () => {
    const data = crypto.getRandomValues(new Uint8Array(32));
    const encoded = customBase64Encode(data);
    const validChars = /^[0-9A-Za-z\-_]+=*$/;
    expect(encoded).toMatch(validChars);
  });
});

import crypto from "crypto";

describe("xxtea", () => {
  const key = Buffer.from("e6483ca2a1eed5e3", "utf-8");

  it("encrypts and decrypts 8 bytes", () => {
    const data = Buffer.from("12345678");
    const enc = xxteaEncrypt(data, key);
    const dec = xxteaDecrypt(enc, key);
    expect(Buffer.from(dec).toString()).toBe("12345678");
  });

  it("encrypts and decrypts 16 bytes", () => {
    const data = Buffer.from("12345678abcdefgh");
    const enc = xxteaEncrypt(data, key);
    const dec = xxteaDecrypt(enc, key);
    expect(Buffer.from(dec).toString()).toBe("12345678abcdefgh");
  });

  it("encrypts and decrypts back to original", () => {
    const plaintext = Buffer.from("Hello, XXTEA!");
    const encrypted = xxteaEncrypt(plaintext, key);
    const decrypted = xxteaDecrypt(encrypted, key);
    const result = Buffer.from(decrypted).toString("utf-8").replace(/\0+$/, "");
    expect(result).toBe("Hello, XXTEA!");
  });

  it("encrypts and decrypts 14 bytes (non-aligned)", () => {
    const data = Buffer.from("14 bytes HELLO");
    const enc = xxteaEncrypt(data, key);
    const dec = xxteaDecrypt(enc, key);
    expect(Buffer.from(dec).toString().replace(/\0+$/, "")).toBe("14 bytes HELLO");
  });

  it("produces different output for different keys", () => {
    const key2 = Buffer.from("aaaaaaaaaaaaaaaa", "utf-8");
    const data = Buffer.from("test data");
    const r1 = xxteaEncrypt(data, key);
    const r2 = xxteaEncrypt(data, key2);
    expect(Buffer.from(r1).toString("hex")).not.toBe(Buffer.from(r2).toString("hex"));
  });
});

describe("mnsv2", () => {
  it("returns a non-empty string", () => {
    const result = mnsv2("/api/test", "{}", "a1_value", "1234567890");
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  });

  it("produces different outputs for different paths", () => {
    const a = mnsv2("/api/a", "{}", "a1", "1000");
    const b = mnsv2("/api/b", "{}", "a1", "1000");
    expect(a).not.toBe(b);
  });
});

describe("generateXsHeader", () => {
  it("returns X-s and X-t headers", () => {
    const headers = generateXsHeader("/api/test", "{}", { a1: "abc123" });
    expect(headers["X-s"]).toBeTruthy();
    expect(headers["X-t"]).toBeTruthy();
  });

  it("X-s starts with XYS_", () => {
    const headers = generateXsHeader("/api/test", "{}");
    expect(headers["X-s"]).toMatch(/^XYS_/);
  });

  it("X-t is a numeric string", () => {
    const headers = generateXsHeader("/api/test", "{}");
    expect(headers["X-t"]).toMatch(/^\d+$/);
  });

  it("produces different X-s for different timestamps", () => {
    const h1 = generateXsHeader("/api/test", "{}", { a1: "a" });
    // Different timestamps should produce different signatures
    const h2 = generateXsHeader("/api/test2", "{}", { a1: "a" });
    expect(h1["X-s"]).not.toBe(h2["X-s"]);
  });
});
