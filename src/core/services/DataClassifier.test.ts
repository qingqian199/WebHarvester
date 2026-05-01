import { DataClassifier } from "./DataClassifier";
import { HarvestResult } from "../models";

function mockResult(overrides?: Partial<HarvestResult>): HarvestResult {
  return {
    traceId: "test-001",
    targetUrl: "https://example.com",
    networkRequests: [
      { url: "https://api.example.com/v1/users", method: "GET", statusCode: 200, requestHeaders: {}, timestamp: 1 },
      { url: "https://cdn.example.com/bundle.js", method: "GET", statusCode: 200, requestHeaders: {}, timestamp: 2 },
      { url: "https://data.example.com/log", method: "POST", statusCode: 200, requestHeaders: {}, timestamp: 3 },
      { url: "https://api.example.com/v2/data", method: "POST", statusCode: 200, requestHeaders: {}, timestamp: 4 },
    ],
    elements: [
      { selector: "input", tagName: "input", attributes: { name: "csrf_token", value: "abc123" } },
      { selector: "div", tagName: "div", attributes: { class: "content" } },
    ],
    storage: {
      cookies: [
        { name: "SESSDATA", value: "secret-session", domain: ".example.com" },
        { name: "a1", value: "device-id-123", domain: ".example.com" },
        { name: "utm_source", value: "google", domain: ".example.com" },
      ],
      localStorage: { token: "eyJhbGciOiJIUzI1NiJ9.test" },
      sessionStorage: {},
    },
    jsVariables: {},
    startedAt: 100,
    finishedAt: 200,
    analysis: {
      apiRequests: [
        { url: "https://api.example.com/v1/users", method: "GET", statusCode: 200, requestHeaders: {}, timestamp: 1 },
      ],
      hiddenFields: [],
      authInfo: { localStorage: { token: "eyJhbGci" }, sessionStorage: {} },
    },
    ...overrides,
  };
}

describe("DataClassifier", () => {
  const classifier = new DataClassifier();

  it("splits result into core and secondary", () => {
    const result = mockResult();
    const classified = classifier.classify(result);

    expect(classified.classification.version).toBe("1.0");
    expect(classified.classification.originalTraceId).toBe("test-001");
    expect(classified.core).toBeDefined();
    expect(classified.secondary).toBeDefined();
  });

  describe("core", () => {
    it("includes filtered API endpoints in core", () => {
      const result = mockResult();
      const classified = classifier.classify(result);

      expect(classified.core.apiEndpoints.length).toBeGreaterThan(0);
      // bundle.js should be excluded (static asset)
      const hasBundleJs = classified.core.apiEndpoints.some((r) => r.url.includes("bundle.js"));
      expect(hasBundleJs).toBe(false);
    });

    it("extracts auth tokens from cookies and localStorage", () => {
      const result = mockResult();
      const classified = classifier.classify(result);

      const tokenKeys = Object.keys(classified.core.authTokens);
      expect(tokenKeys.some((k) => k.includes("SESSDATA"))).toBe(true);
      expect(tokenKeys.some((k) => k.includes("token"))).toBe(true);
    });

    it("extracts device fingerprint", () => {
      const result = mockResult();
      const classified = classifier.classify(result);

      expect(classified.core.deviceFingerprint.cookies.length).toBeGreaterThan(0);
      const hasA1 = classified.core.deviceFingerprint.cookies.some((c) => c.name === "a1");
      expect(hasA1).toBe(true);
    });

    it("includes antiCrawlDefenses", () => {
      const result = mockResult();
      const items = [{ category: "wbi_sign", severity: "high", requestKey: "GET https://api.example.com/sign" }];
      const classified = classifier.classify(result, items);

      expect(classified.core.antiCrawlDefenses).toHaveLength(1);
      expect(classified.core.antiCrawlDefenses[0].category).toBe("wbi_sign");
    });
  });

  describe("secondary", () => {
    it("includes all captured requests", () => {
      const result = mockResult();
      const classified = classifier.classify(result);

      expect(classified.secondary.allCapturedRequests.length).toBe(result.networkRequests.length);
    });

    it("includes DOM structure", () => {
      const result = mockResult();
      const classified = classifier.classify(result);

      expect(classified.secondary.domStructure.length).toBe(result.elements.length);
    });

    it("extracts hidden fields from elements", () => {
      const result = mockResult();
      const classified = classifier.classify(result);

      expect(classified.secondary.hiddenFields.length).toBeGreaterThan(0);
      expect(classified.secondary.hiddenFields[0].name).toBe("csrf_token");
    });

    it("handles empty elements gracefully", () => {
      const result = mockResult({ elements: [], analysis: undefined });
      const classified = classifier.classify(result);

      expect(classified.secondary.domStructure).toEqual([]);
      expect(classified.secondary.hiddenFields).toEqual([]);
    });
  });
});
