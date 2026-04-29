import { getSafeDomainName } from "./batch-loader";

describe("getSafeDomainName", () => {
  it("extracts hostname from http URL", () => {
    expect(getSafeDomainName("http://example.com/page")).toBe("example_com");
  });

  it("extracts hostname from https URL", () => {
    expect(getSafeDomainName("https://www.bilibili.com/video/BV123")).toBe("www_bilibili_com");
  });

  it("handles URLs with port", () => {
    expect(getSafeDomainName("https://localhost:3000")).toBe("localhost");
  });

  it("replaces dots with underscores", () => {
    expect(getSafeDomainName("https://sub.domain.example.com")).toBe("sub_domain_example_com");
  });

  it("handles hyphens in hostname", () => {
    expect(getSafeDomainName("https://my-site.com")).toBe("my-site_com");
  });

  it("returns 'unknown_site' for invalid URL", () => {
    expect(getSafeDomainName("not a url")).toBe("unknown_site");
  });

  it("returns 'unknown_site' for empty string", () => {
    expect(getSafeDomainName("")).toBe("unknown_site");
  });
});
