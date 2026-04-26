import { ILogger } from "../core/ports/ILogger";
import { IBrowserAdapter } from "../core/ports/IBrowserAdapter";
import { IStorageAdapter } from "../core/ports/IStorageAdapter";
import { HarvesterService } from "../core/services/HarvesterService";
import { BatchTaskItem } from "../core/config/app-config";
import { randomDelay } from "../utils/human-behavior";
import { BROWSER_MASK_CONFIG } from "../core/config";
import { FeatureFlags } from "../core/features";

export class BatchHarvestService {
  private readonly single: HarvesterService;

  constructor(
    private readonly logger: ILogger,
    private readonly browser: IBrowserAdapter,
    private readonly storage: IStorageAdapter
  ) {
    this.single = new HarvesterService(logger, browser, storage);
  }

  async runBatch(tasks: BatchTaskItem[]): Promise<void> {
    if (tasks.length === 0) {
      this.logger.warn("批量任务为空");
      return;
    }
    this.logger.info(`开始批量采集，共${tasks.length}个站点`);

    if (!FeatureFlags.enableParallelTask) {
      for (let i = 0; i < tasks.length; i++) {
        await this.runItem(tasks[i], i + 1, tasks.length);
        if (i !== tasks.length - 1) {
          await randomDelay(BROWSER_MASK_CONFIG.minDelayMs, BROWSER_MASK_CONFIG.maxDelayMs);
        }
      }
    }
    this.logger.info("✅ 批量任务全部完成");
  }

  private async runItem(task: BatchTaskItem, idx: number, total: number) {
    try {
      await this.single.harvest({
        targetUrl: task.targetUrl,
        actions: task.actions,
        elementSelectors: task.elementSelectors,
        jsScripts: task.jsScripts,
        networkCapture: task.networkCapture
      });
      this.logger.info(`[${idx}/${total}] 成功：${task.targetUrl}`);
    } catch (e) {
      this.logger.error(`[${idx}/${total}] 失败：${task.targetUrl}`, { err: (e as Error).message });
    }
  }
}