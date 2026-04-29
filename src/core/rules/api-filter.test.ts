import { isStaticAsset, filterApiRequests } from "./api-filter";
import { NetworkRequest } from "../models";

function makeReq(url: string, method = "GET"): NetworkRequest {
  return { url, method, statusCode: 200, requestHeaders: {}, timestamp: Date.now() };
}

describe("isStaticAsset", () => {
  it("returns true for .js urls", () => {
    expect(isStaticAsset("https://example.com/app.js")).toBe(true);
  });

  it("returns true for .css urls", () => {
    expect(isStaticAsset("https://example.com/style.css")).toBe(true);
  });

  it("returns true for image formats", () => {
    expect(isStaticAsset("https://example.com/photo.png")).toBe(true);
    expect(isStaticAsset("https://example.com/photo.jpg")).toBe(true);
    expect(isStaticAsset("https://example.com/photo.jpeg")).toBe(true);
    expect(isStaticAsset("https://example.com/photo.gif")).toBe(true);
    expect(isStaticAsset("https://example.com/photo.svg")).toBe(true);
    expect(isStaticAsset("https://example.com/photo.ico")).toBe(true);
  });

  it("returns true for font formats", () => {
    expect(isStaticAsset("https://example.com/font.woff")).toBe(true);
    expect(isStaticAsset("https://example.com/font.ttf")).toBe(true);
  });

  it("returns true for video formats", () => {
    expect(isStaticAsset("https://example.com/video.mp4")).toBe(true);
    expect(isStaticAsset("https://example.com/audio.mp3")).toBe(true);
  });

  it("returns false for api urls", () => {
    expect(isStaticAsset("https://example.com/api/users")).toBe(false);
  });

  it("returns false for html pages", () => {
    expect(isStaticAsset("https://example.com/")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isStaticAsset("https://example.com/App.JS")).toBe(true);
    expect(isStaticAsset("https://example.com/Style.CSS")).toBe(true);
  });
});

describe("filterApiRequests", () => {
  it("returns only requests matching api keywords", () => {
    const list = [
      makeReq("https://example.com/api/users"),
      makeReq("https://example.com/app.js"),
      makeReq("https://example.com/style.css"),
      makeReq("https://example.com/v1/products"),
    ];
    const result = filterApiRequests(list);
    expect(result).toHaveLength(2);
    expect(result[0].url).toContain("/api/");
    expect(result[1].url).toContain("/v1/");
  });

  it("filters out all static assets", () => {
    const list = [
      makeReq("https://example.com/bundle.js"),
      makeReq("https://example.com/style.css"),
      makeReq("https://example.com/logo.png"),
    ];
    expect(filterApiRequests(list)).toHaveLength(0);
  });

  it("returns empty array given empty input", () => {
    expect(filterApiRequests([])).toHaveLength(0);
  });

  it("recognizes multiple api keyword patterns", () => {
    const keywords = ["/api/", "/ajax/", "/graphql", "/rest/", "/auth/"];
    for (const kw of keywords) {
      const list = [makeReq(`https://example.com${kw}users`)];
      expect(filterApiRequests(list)).toHaveLength(1);
    }
  });
});
