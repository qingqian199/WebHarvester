import { HarvestResult, NetworkRequest } from "../models";
import { ClassifiedHarvestResult, CoreInfo, SecondaryInfo } from "../models/ClassifiedData";
import { filterApiRequests } from "../rules/api-filter";
import { AUTH_STORAGE_KEYWORDS } from "../rules/auth-rule";

/** 已知的埋点/统计域名，应归入次要信息而非核心 API。 */
const TRACKING_DOMAINS = [
  "data.bilibili.com", "cm.bilibili.com", "api.vc.bilibili.com",
  "as.xiaohongshu.com", "apm-fe.xiaohongshu.com", "t2.xiaohongshu.com",
  "sns-avatar-qc.xhscdn.com",
];

function isTrackingRequest(req: NetworkRequest): boolean {
  try {
    const host = new URL(req.url).hostname;
    return TRACKING_DOMAINS.some((d) => host.includes(d));
  } catch {
    return false;
  }
}

/** 提取核心 API 端点：排除静态资源 + 排除埋点上报 */
function extractCoreApiEndpoints(apiRequests: NetworkRequest[], allRequests: NetworkRequest[]): NetworkRequest[] {
  const filtered = filterApiRequests(allRequests);
  return filtered.filter((r) => !isTrackingRequest(r));
}

/** 从 Storage 中提取鉴权令牌 */
function extractAuthTokens(storage: HarvestResult["storage"]): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const store of [storage.localStorage, storage.sessionStorage]) {
    for (const [k, v] of Object.entries(store)) {
      if (AUTH_STORAGE_KEYWORDS.some((w) => k.toLowerCase().includes(w))) {
        tokens[`localStorage.${k}`] = v.slice(0, 100);
      }
    }
  }
  for (const c of storage.cookies) {
    if (["session", "token", "sid", "sess", "SESSDATA", "web_session"].some((w) => c.name.includes(w))) {
      tokens[`cookie.${c.name}`] = c.value.slice(0, 100);
    }
  }
  return tokens;
}

/** 提取设备指纹 */
function extractDeviceFingerprint(storage: HarvestResult["storage"]): CoreInfo["deviceFingerprint"] {
  const idCookies = storage.cookies.filter((c) =>
    ["buvid", "a1", "b_lsid", "device", "fingerprint", "uuid", "clientId"].some((w) =>
      c.name.toLowerCase().includes(w),
    ),
  );
  return {
    cookies: idCookies.map((c) => ({ name: c.name, value: c.value.slice(0, 30), domain: c.domain })),
    localStorageKeys: Object.keys(storage.localStorage).slice(0, 20),
  };
}

/** 提取隐藏字段 */
function extractHiddenFields(result: HarvestResult): SecondaryInfo["hiddenFields"] {
  const fields: SecondaryInfo["hiddenFields"] = [];
  for (const el of result.elements) {
    const name = (el.attributes.name || "").toLowerCase();
    if (["csrf", "token", "vcode", "captcha", "sign", "nonce", "ticket"].some((k) => name.includes(k))) {
      fields.push({ name: el.attributes.name, value: el.attributes.value });
    }
  }
  return fields;
}

/**
 * 数据分类器。将 HarvestResult 分为核心信息（core）和次要信息（secondary）。
 * 核心信息用于爬虫前置分析；次要信息用于页面存档。
 */
export class DataClassifier {
  /**
   * 对一次采集结果执行分类。
   * @param result 原始采集结果。
   * @param antiCrawlItems 可选的反爬检测结果。
   */
  classify(
    result: HarvestResult,
    antiCrawlItems?: Array<{ category: string; severity: string; requestKey: string }>,
  ): ClassifiedHarvestResult {
    const apiRequests = (result.analysis?.apiRequests ?? []).concat(
      filterApiRequests(result.networkRequests),
    );

    return {
      classification: {
        version: "1.0",
        classifiedAt: new Date().toISOString(),
        originalTraceId: result.traceId,
      },
      core: {
        apiEndpoints: extractCoreApiEndpoints(apiRequests, result.networkRequests),
        authTokens: extractAuthTokens(result.storage),
        deviceFingerprint: extractDeviceFingerprint(result.storage),
        antiCrawlDefenses: antiCrawlItems ?? [],
      },
      secondary: {
        allCapturedRequests: result.networkRequests,
        domStructure: result.elements.map((el) => ({
          tagName: el.tagName,
          selector: el.selector,
          attributes: el.attributes,
        })),
        performanceMetrics: result.pageMetrics,
        jsVariables: result.jsVariables,
        hiddenFields: extractHiddenFields(result),
      },
    };
  }
}
