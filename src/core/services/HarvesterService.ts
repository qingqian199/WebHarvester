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

/** 采集服务——核心编排器。协调浏览器自动化、数据提取、规则分析和结果存储。 */
export class HarvesterService {
  constructor(
    private readonly logger: ILogger,
    private readonly browser: IBrowserAdapter,
    private readonly storage: IStorageAdapter
  ) { }

  /**
   * 执行一次完整采集任务。
   * @param config 采集配置（目标 URL、操作、选择器等）。
   * @param outputFormat 输出格式（json/md/csv/har/all，默认 all）。
   * @param needSaveSession 是否将本次登录态保存为会话。
   * @param sessionManager 会话管理器实例。
   * @param sessionProfile 会话保存名称。
   * @param sessionState 预先注入的登录态。
   * @throws {BizError} 配置为空或 URL 非法时抛出。
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
        traceId,
        targetUrl: config.targetUrl,
        networkRequests,
        elements,
        storage,
        jsVariables,
        startedAt: start,
        finishedAt: end,
        pageMetrics: pageMetrics ?? undefined,
        analysis: {
          apiRequests,
          hiddenFields,
          authInfo: {
            localStorage: authLocal,
            sessionStorage: authSession
          }
        }
      };

      await this.storage.save(result, outputFormat);

      if (needSaveSession && sessionManager && sessionProfile) {
        const session: SessionState = {
          cookies: storage.cookies,
          localStorage: storage.localStorage,
          sessionStorage: storage.sessionStorage,
          createdAt: Date.now(),
          lastUsedAt: Date.now()
        };
        await sessionManager.save(sessionProfile, session);
        this.logger.info(`✅ 会话已保存至：${sessionProfile}`);
      }

      this.logger.info("采集任务完成", { cost: end - start, apiCount: apiRequests.length });
      return result;
    }, TASK_GLOBAL_TIMEOUT_MS).finally(async () => {
      await this.browser.close();
    });
  }
}
