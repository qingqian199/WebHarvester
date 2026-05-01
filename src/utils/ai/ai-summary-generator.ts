import { HarvestResult } from "../../core/models";
import { AiCompactObservation, IAiSummaryGenerator } from "../../core/ports/IAiSummary";
import { DataClassifier } from "../../core/services/DataClassifier";

const MAX_ENDPOINTS = 8;
const MAX_PARSE_FIELDS = 6;

export class AiSummaryGenerator implements IAiSummaryGenerator {
  build(result: HarvestResult): AiCompactObservation {
    const classifier = new DataClassifier();
    const classified = classifier.classify(result);
    const { core } = classified;

    const domain = new URL(result.targetUrl).hostname;
    const totalReqs = classified.secondary.allCapturedRequests.length;

    const authTypes = new Set<string>();
    core.apiEndpoints.forEach((req) => {
      if (req.requestHeaders?.authorization) authTypes.add("Bearer");
      if (req.requestHeaders?.["x-token"]) authTypes.add("x-token");
    });

    const summary = `页面共发起${totalReqs}条请求，核心API ${core.apiEndpoints.length}个，鉴权令牌${Object.keys(core.authTokens).length}项，反爬机制${core.antiCrawlDefenses.length}个`;

    const endpoints = core.apiEndpoints.slice(0, MAX_ENDPOINTS).map((req) => ({
      method: req.method,
      url: this.shortUrl(req.url),
      authType: [...authTypes][0] || "none",
      dataFields: this.parseFields(req.requestBody),
    }));

    return {
      summary,
      pageMeta: {
        title: "Untitled",
        domain,
        renderType: totalReqs > 15 ? "spa-dynamic" : "static",
      },
      endpoints,
      interactiveElements: [],
      riskTips: core.antiCrawlDefenses.map((d) => `${d.category}(${d.severity})`),
    };
  }

  private shortUrl(url: string): string {
    try {
      const u = new URL(url);
      return `${u.pathname}${u.search}`;
    } catch {
      return url;
    }
  }

  private parseFields(body: unknown): string[] {
    if (!body) return [];
    try {
      const o = typeof body === "string" ? JSON.parse(body) : body;
      return Object.keys(o as object).slice(0, MAX_PARSE_FIELDS);
    } catch {
      return [];
    }
  }
}
