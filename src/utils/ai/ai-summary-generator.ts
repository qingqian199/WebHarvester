import { HarvestResult } from "../../core/models";
import { filterApiRequests } from "../../core/rules";
import { AiCompactObservation, IAiSummaryGenerator } from "../../core/ports/IAiSummary";

export class AiSummaryGenerator implements IAiSummaryGenerator {
  build(result: HarvestResult): AiCompactObservation {
    const apiList = filterApiRequests(result.networkRequests);
    const domain = new URL(result.targetUrl).hostname;

    const summary = `页面共发起${result.networkRequests.length}条网络请求，业务接口${apiList.length}个，检测到${result.elements.length}个页面元素，包含授权令牌/缓存存储。`;

    const endpoints = apiList.slice(0, 8).map(req => {
      let authType = "none";
      if (req.requestHeaders?.authorization) authType = "Bearer";
      if (req.requestHeaders?.["x-token"]) authType = "x-token";
      return {
        method: req.method,
        url: this.shortUrl(req.url),
        authType,
        dataFields: this.parseFields(req.requestBody)
      };
    });

    const interactiveElements = result.elements
      .filter(el => ["input", "button", "form"].includes(el.tagName))
      .slice(0, 12)
      .map((el, idx) => ({
        alias: `@e${idx + 1}`,
        type: el.tagName as "input" | "button" | "form",
        selector: el.selector,
        label: el.attributes.placeholder || el.attributes.name
      }));

    return {
      summary,
      pageMeta: {
        title: "Untitled",
        domain,
        renderType: result.networkRequests.length > 15 ? "spa-dynamic" : "static"
      },
      endpoints,
      interactiveElements,
      riskTips: []
    };
  }

  private shortUrl(url: string): string {
    const u = new URL(url);
    return `${u.pathname}${u.search}`;
  }

  private parseFields(body: unknown): string[] {
    if (!body) return [];
    try {
      const o = typeof body === "string" ? JSON.parse(body) : body;
      return Object.keys(o as object).slice(0, 6);
    } catch {
      return [];
    }
  }
}