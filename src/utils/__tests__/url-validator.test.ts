import { sanitizeUrl, isValidUrl, isPublicHostname, validateUrl } from "../url-validator";
import { BizError } from "../../core/error/BizError";

describe("sanitizeUrl", () => {
  it("removes CRLF characters", () => {
    expect(sanitizeUrl("http://example.com\r\n/path")).toBe("http://example.com/path");
  });

  it("removes null bytes", () => {
    expect(sanitizeUrl("http://example.com\0/path")).toBe("http://example.com/path");
  });

  it("trims whitespace", () => {
    expect(sanitizeUrl("  http://example.com  ")).toBe("http://example.com");
  });

  it("returns null for empty after sanitization", () => {
    expect(sanitizeUrl("  \r\n  ")).toBeNull();
  });
});

describe("isValidUrl", () => {
  it("accepts valid http URL", () => {
    expect(isValidUrl("http://example.com")).toBe(true);
  });

  it("accepts valid https URL", () => {
    expect(isValidUrl("https://example.com/path?q=1")).toBe(true);
  });

  it("rejects file protocol", () => {
    expect(isValidUrl("file:///etc/passwd")).toBe(false);
  });

  it("rejects data URLs", () => {
    expect(isValidUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
  });

  it("rejects javascript URLs", () => {
    expect(isValidUrl("javascript:alert(1)")).toBe(false);
  });

  it("rejects ftp URLs", () => {
    expect(isValidUrl("ftp://example.com/file")).toBe(false);
  });

  it("rejects malformed URLs", () => {
    expect(isValidUrl("not a url")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidUrl("")).toBe(false);
  });

  it("rejects CRLF-only input", () => {
    expect(isValidUrl("\r\n")).toBe(false);
  });
});

describe("isPublicHostname", () => {
  it("accepts public domains", () => {
    expect(isPublicHostname("example.com")).toBe(true);
    expect(isPublicHostname("www.google.com")).toBe(true);
    expect(isPublicHostname("api.github.com")).toBe(true);
    expect(isPublicHostname("8.8.8.8")).toBe(true); // Google DNS is public
  });

  it("rejects localhost", () => {
    expect(isPublicHostname("localhost")).toBe(false);
    expect(isPublicHostname("localhost.localdomain")).toBe(false);
  });

  it("rejects loopback IPs", () => {
    expect(isPublicHostname("127.0.0.1")).toBe(false);
    expect(isPublicHostname("127.0.0.2")).toBe(false);
    expect(isPublicHostname("0.0.0.0")).toBe(false);
    expect(isPublicHostname("::1")).toBe(false);
    expect(isPublicHostname("[::1]")).toBe(false);
  });

  it("rejects private network ranges", () => {
    expect(isPublicHostname("10.0.0.1")).toBe(false);
    expect(isPublicHostname("10.255.255.255")).toBe(false);
    expect(isPublicHostname("172.16.0.1")).toBe(false);
    expect(isPublicHostname("172.31.255.255")).toBe(false);
    expect(isPublicHostname("192.168.0.1")).toBe(false);
    expect(isPublicHostname("192.168.255.255")).toBe(false);
  });

  it("accepts addresses outside private ranges", () => {
    expect(isPublicHostname("172.15.255.255")).toBe(true);  // just below 172.16/12
    expect(isPublicHostname("172.32.0.1")).toBe(true);       // just above 172.16/12
    expect(isPublicHostname("11.0.0.1")).toBe(true);          // 11.x.x.x is public
  });

  it("rejects cloud metadata IP", () => {
    expect(isPublicHostname("169.254.169.254")).toBe(false);
    expect(isPublicHostname("169.254.169.253")).toBe(false); // 169.254/16
  });

  it("handles case-insensitive hostnames", () => {
    expect(isPublicHostname("LOCALHOST")).toBe(false);
    expect(isPublicHostname("LOCALHOST.localdomain")).toBe(false);
  });
});

describe("validateUrl (full integration)", () => {
  it("accepts legitimate public URLs", () => {
    expect(() => validateUrl("https://www.example.com/page")).not.toThrow();
    expect(() => validateUrl("http://example.com")).not.toThrow();
  });

  it("rejects private IP URLs", () => {
    expect(() => validateUrl("http://192.168.1.1/admin")).toThrow(BizError);
    expect(() => validateUrl("http://10.0.0.1")).toThrow(BizError);
    expect(() => validateUrl("http://172.16.0.1:8080")).toThrow(BizError);
  });

  it("rejects localhost URLs", () => {
    expect(() => validateUrl("http://localhost:3000")).toThrow(BizError);
    expect(() => validateUrl("http://127.0.0.1")).toThrow(BizError);
    expect(() => validateUrl("http://0.0.0.0")).toThrow(BizError);
  });

  it("rejects metadata service URLs", () => {
    expect(() => validateUrl("http://169.254.169.254/latest/meta-data/")).toThrow(BizError);
  });

  it("rejects file protocol URLs", () => {
    expect(() => validateUrl("file:///etc/passwd")).toThrow(BizError);
  });

  it("rejects malformed URLs", () => {
    expect(() => validateUrl("not a url")).toThrow(BizError);
  });

  it("rejects CRLF injection", () => {
    expect(() => validateUrl("http://example.com\r\n")).not.toThrow(); // sanitized to valid URL
    // Test a pure CRLF string
    expect(() => validateUrl("\r\n")).toThrow(BizError);
  });

  it("rejects empty input", () => {
    expect(() => validateUrl("")).toThrow(BizError);
  });
});
