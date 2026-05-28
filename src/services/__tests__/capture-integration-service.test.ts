import { describe, it, expect, beforeAll } from "@jest/globals";
import { CaptureIntegrationService } from "../capture-integration-service.js";
import path from "path";
import fs from "fs";

const FIXTURE_HAR = path.resolve("tests/fixtures/sample-miyoushe.har");
const FIXTURE_INVALID = path.resolve("tests/fixtures/invalid.txt");

if (!fs.existsSync(FIXTURE_HAR)) {
  throw new Error(`Fixture not found: ${FIXTURE_HAR}. Run 'echo {} > tests/fixtures/sample-miyoushe.har' first`);
}
if (!fs.existsSync(FIXTURE_INVALID)) {
  throw new Error(`Fixture not found: ${FIXTURE_INVALID}. Run 'echo invalid > tests/fixtures/invalid.txt' first`);
}

describe("CaptureIntegrationService", () => {
  let svc: CaptureIntegrationService;
  beforeAll(() => { svc = new CaptureIntegrationService(); });

  describe("importMitmDump (HAR)", () => {
    it("parses a standard HAR file", async () => {
      const exchanges = await svc.importMitmDump(FIXTURE_HAR);
      expect(exchanges.length).toBe(2);
      expect(exchanges.find((e) => e.url.includes("getUserFullInfo"))).toBeDefined();
    });
    it("throws for unrecognized file format", async () => {
      await expect(svc.importMitmDump(FIXTURE_INVALID)).rejects.toThrow("无法识别的文件格式");
    });
  });

  describe("analyzeAndSuggest", () => {
    it("groups endpoints and detects sign params", async () => {
      const exchanges = await svc.importMitmDump(FIXTURE_HAR);
      const report = svc.analyzeAndSuggest(exchanges, "miyoushe.com");
      expect(report.totalRequests).toBeGreaterThanOrEqual(2);
      expect(report.potentialSignParams).toContain("ds");
    });
  });

  describe("generateSigningClue", () => {
    it("returns clues for sign params", async () => {
      const clues = await svc.generateSigningClue(await svc.importMitmDump(FIXTURE_HAR));
      expect(clues.some((c) => c.paramName === "ds")).toBe(true);
    });
  });
});
