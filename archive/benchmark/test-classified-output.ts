import { generateMarkdownReport } from "../src/utils/reporter/md-reporter";
import { AiSummaryGenerator } from "../src/utils/ai/ai-summary-generator";
import { HarvestResult } from "../src/core/models";

const result: HarvestResult = {
  traceId: "test-001",
  targetUrl: "https://example.com",
  networkRequests: [
    { url: "https://api.example.com/v1/users", method: "GET", statusCode: 200, requestHeaders: {}, timestamp: 1 },
    { url: "https://cdn.example.com/bundle.js", method: "GET", statusCode: 200, requestHeaders: {}, timestamp: 2 },
  ],
  elements: [{ selector: "input", tagName: "input", attributes: { name: "csrf_token", value: "tok" } }],
  storage: { localStorage: { token: "eyJhbGciOiJIUzI1NiJ9.test" }, sessionStorage: {}, cookies: [{ name: "SESSDATA", value: "s1", domain: ".example.com" }] },
  jsVariables: {},
  startedAt: Date.now() - 1000,
  finishedAt: Date.now(),
  analysis: { apiRequests: [], hiddenFields: [], authInfo: { localStorage: {}, sessionStorage: {} } },
};

console.log("=== Markdown 报告 ===\n");
console.log(generateMarkdownReport(result));

console.log("\n=== AI 摘要 ===\n");
const ai = new AiSummaryGenerator();
console.log(JSON.stringify(ai.build(result), null, 2));
