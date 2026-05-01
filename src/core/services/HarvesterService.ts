import { ILogger } from "../ports/ILogger";
import { IBrowserAdapter } from "../ports/IBrowserAdapter";
import { IStorageAdapter } from "../ports/IStorageAdapter";
import { ISessionManager, SessionState } from "../ports/ISessionManager";
import { HarvestConfig, HarvestResult } from "../models";
import { generateTraceId } from "../../utils/trace";
import { withGlobalTimeout } from "../../utils/taskTimeout";
import { TASK_GLOBAL_TIMEOUT_MS } from "../config";
import { ensureValidUrl, filterEmptySelectors } from "../../utils/validator";
import { BizError } from "../error/BizError";
import { ErrorCode } from "../error/ErrorCode";
import { filterApiRequests, filterHiddenFields, extractAuthStorage } from "../rules";
import { StrategyOrchestrator } from "./StrategyOrchestrator";
import { ILightHttpEngine } from "../ports/ILightHttpEngine";
import { CrawlerDispatcher } from "./CrawlerDispatcher";
import { CrawlerSession } from "../ports/ISiteCrawler";
import { DataClassifier } from "./DataClassifier";

/** 采集服务——核心编排器。协调浏览器自动化、数据提取、规则分析和结果存储。 */
export class HarvesterService {
  constructor(
    private readonly logger: ILogger,
    private readonly browser: IBrowserAdapter,
    private readonly storage: IStorageAdapter,
    private readonly httpEngine?: ILightHttpEngine,
    private readonly crawlerDispatcher?: CrawlerDispatcher,
  ) { }

  /**
   * 执行一次完整采集任务。
   * 自动判断：静态页面使用轻量 HTTP，SPA/动态页面使用浏览器。
   */
  async harvest(
    config: HarvestConfig,
    outputFormat: string = "all",
    needSaveSession = false,
    sessionManager?: ISessionManager,
    sessionProfile?: string,
    sessionState?: SessionState
  ): Promise<HarvestResult> {
    return withGlobalTimeout(async () => {
      if (!config?.targetUrl) {
        throw new BizError(ErrorCode.EMPTY_TASK_CONFIG, "缺失目标网址");
      }
      ensureValidUrl(config.targetUrl);

      const traceId = generateTraceId();
      this.logger.setTraceId?.(traceId);
      this.logger.info("开始采集任务", { url: config.targetUrl });

      // 策略决策 0：优先使用特化爬虫
      if (this.crawlerDispatcher) {
        const session: CrawlerSession | undefined = sessionState
          ? { cookies: sessionState.cookies, localStorage: sessionState.localStorage }
          : undefined;
        const pageData = await this.crawlerDispatcher.fetch(config.targetUrl, session);
        if (pageData) {
          return this.handleCrawlerResult(config, pageData, traceId, outputFormat);
        }
        this.logger.info("无特化爬虫匹配，切换为通用引擎", { url: config.targetUrl });
      }

      // 策略决策 1：轻量 HTTP 引擎
      if (this.httpEngine) {
        const lightResult = await this.httpEngine.fetch(config.targetUrl).catch(() => null);
        if (lightResult) {
          const engine = await StrategyOrchestrator.decideEngine(lightResult.html);
          if (engine === "http") {
            return this.harvestWithHttp(config, lightResult, traceId, outputFormat);
          }
          this.logger.info("检测到动态页面，切换为浏览器引擎", { url: config.targetUrl });
        } else {
          this.logger.warn("HTTP 引擎请求失败，回退到浏览器引擎", { url: config.targetUrl });
        }
      }

      return this.harvestWithBrowser(config, outputFormat, needSaveSession, sessionManager, sessionProfile, sessionState, traceId);
    }, TASK_GLOBAL_TIMEOUT_MS).finally(async () => {
      await this.browser.close();
    });
  }

  private async handleCrawlerResult(
    config: HarvestConfig,
    pageData: import("../ports/ISiteCrawler").PageData,
    traceId: string,
    outputFormat: string,
  ): Promise<HarvestResult> {
    const { statusCode, body, headers, responseTime } = pageData;
    const result: HarvestResult = {
      traceId,
      targetUrl: config.targetUrl,
      networkRequests: [{
        url: config.targetUrl, method: "GET", statusCode,
        requestHeaders: headers,
        responseBody: body.slice(0, 10000),
        timestamp: Date.now() - responseTime, completedAt: Date.now(),
      }],
      elements: [],
      storage: { localStorage: {}, sessionStorage: {}, cookies: [] },
      jsVariables: {},
      startedAt: Date.now() - responseTime,
      finishedAt: Date.now(),
      analysis: { apiRequests: [], hiddenFields: [], authInfo: { localStorage: {}, sessionStorage: {} } },
    };
    await this.storage.save(result, outputFormat);
    this.logClassification(result);
    this.logger.info("特化爬虫采集完成", { cost: responseTime, status: statusCode });
    return result;
  }

  private async harvestWithHttp(
    config: HarvestConfig,
    lightResult: import("../ports/ILightHttpEngine").LightHttpResult,
    traceId: string,
    outputFormat: string,
  ): Promise<HarvestResult> {
    const start = Date.now();
    const { html, statusCode, responseTime } = lightResult;

    const result: HarvestResult = {
      traceId,
      targetUrl: config.targetUrl,
      networkRequests: [{
        url: config.targetUrl, method: "GET", statusCode,
        requestHeaders: {}, responseBody: html.slice(0, 5000),
        timestamp: start, completedAt: start + responseTime,
      }],
      elements: [],
      storage: { localStorage: {}, sessionStorage: {}, cookies: [] },
      jsVariables: {},
      startedAt: start,
      finishedAt: start + responseTime,
      analysis: { apiRequests: [], hiddenFields: [], authInfo: { localStorage: {}, sessionStorage: {} } },
    };

    await this.storage.save(result, outputFormat);
    this.logClassification(result);
    this.logger.info("HTTP 采集完成", { cost: responseTime, status: statusCode });
    return result;
  }

  private async harvestWithBrowser(
    config: HarvestConfig,
    outputFormat: string,
    needSaveSession: boolean,
    sessionManager: ISessionManager | undefined,
    sessionProfile: string | undefined,
    sessionState: SessionState | undefined,
    traceId: string,
  ): Promise<HarvestResult> {
    const start = Date.now();
    await this.browser.launch(config.targetUrl, sessionState);
    await this.browser.performActions(config.actions);

    const [networkRequests, elements, storage] = await Promise.all([
      this.browser.captureNetworkRequests(config.networkCapture ?? { captureAll: true }),
      this.browser.queryElements(filterEmptySelectors(config.elementSelectors ?? [])),
      this.browser.getStorage(config.storageTypes ?? ["localStorage", "sessionStorage", "cookies"])
    ]);

    const jsVariables: Record<string, unknown> = {};
    if (config.jsScripts?.length) {
      for (const s of config.jsScripts) {
        if (typeof s === "string") continue;
        try {
          jsVariables[s.alias] = await this.browser.executeScript(s.script);
        } catch {
          this.logger.warn("脚本执行失败", { alias: s.alias });
        }
      }
    }

    const end = Date.now();
    const apiRequests = filterApiRequests(networkRequests);
    const hiddenFields = filterHiddenFields(elements);
    const authLocal = extractAuthStorage(storage.localStorage);
    const authSession = extractAuthStorage(storage.sessionStorage);
    const pageMetrics = this.browser.getPageMetrics();

    const result: HarvestResult = {
      traceId, targetUrl: config.targetUrl,
      networkRequests, elements, storage, jsVariables,
      startedAt: start, finishedAt: end,
      pageMetrics: pageMetrics ?? undefined,
      analysis: { apiRequests, hiddenFields, authInfo: { localStorage: authLocal, sessionStorage: authSession } },
    };

    await this.storage.save(result, outputFormat);
    this.logClassification(result);

    if (needSaveSession && sessionManager && sessionProfile) {
      const session: SessionState = {
        cookies: storage.cookies, localStorage: storage.localStorage,
        sessionStorage: storage.sessionStorage, createdAt: Date.now(), lastUsedAt: Date.now(),
      };
      await sessionManager.save(sessionProfile, session);
      this.logger.info(`✅ 会话已保存至：${sessionProfile}`);
    }

    this.logger.info("采集任务完成", { cost: end - start, apiCount: apiRequests.length });
    return result;
  }

  private logClassification(result: HarvestResult): void {
    const classifier = new DataClassifier();
    const classified = classifier.classify(result);
    this.logger.info("📊 数据分类完成", {
      coreApiCount: classified.core.apiEndpoints.length,
      authTokens: Object.keys(classified.core.authTokens).length,
      antiCrawl: classified.core.antiCrawlDefenses.length,
      secondaryRequests: classified.secondary.allCapturedRequests.length,
    });
  }
}
