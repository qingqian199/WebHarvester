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
import { getSafeDomainName } from "../../utils/batch-loader";

export class HarvesterService {
  constructor(
    private readonly logger: ILogger,
    private readonly browser: IBrowserAdapter,
    private readonly storage: IStorageAdapter
  ) {}

  async harvest(
    config: HarvestConfig,
    outputFormat: string = "all",
    needSaveSession = false,
    sessionManager?: ISessionManager,
    sessionProfile?: string
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
      await this.browser.launch(config.targetUrl);
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
          } catch (e) {
            this.logger.warn("脚本执行失败", { alias: s.alias });
          }
        }
      }

      const end = Date.now();
      const apiRequests = filterApiRequests(networkRequests);
      const hiddenFields = filterHiddenFields(elements);
      const authLocal = extractAuthStorage(storage.localStorage);
      const authSession = extractAuthStorage(storage.sessionStorage);

      const result: HarvestResult = {
        traceId,
        targetUrl: config.targetUrl,
        networkRequests,
        elements,
        storage,
        jsVariables,
        startedAt: start,
        finishedAt: end,
        analysis: {
          apiRequests,
          hiddenFields,
          authInfo: { localStorage: authLocal, sessionStorage: authSession }
        }
      };

      await this.storage.save(result, outputFormat);

      // 会话持久化保存
      if (needSaveSession && sessionManager && sessionProfile) {
        const sessionState: SessionState = {
          cookies: storage.cookies,
          localStorage: storage.localStorage,
          sessionStorage: storage.sessionStorage,
          createdAt: Date.now(),
          lastUsedAt: Date.now()
        };
        await sessionManager.save(sessionProfile, sessionState);
        this.logger.info(`✅ 会话已保存至：${sessionProfile}`);
      }

      this.logger.info("采集任务完成", { cost: end - start, apiCount: apiRequests.length });
      return result;
    }, TASK_GLOBAL_TIMEOUT_MS).finally(async () => {
      await this.browser.close();
    });
  }
}
