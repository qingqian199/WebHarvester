import { ILogger } from "../core/ports/ILogger";
import { HarvesterService } from "../core/services/HarvesterService";
import { BatchTaskItem } from "../core/config/app-config";
import { PlaywrightAdapter } from "../adapters/PlaywrightAdapter";
import { FileStorageAdapter } from "../adapters/FileStorageAdapter";
import { SqliteStorageAdapter } from "../storage/sqlite-storage-adapter";
import { CompositeStorageAdapter } from "../storage/composite-storage-adapter";
import { randomDelay } from "../utils/human-behavior";
import { BROWSER_MASK_CONFIG } from "../core/config";

const DEFAULT_CONCURRENCY = 1;

export class BatchHarvestService {
  private readonly concurrency: number;

  constructor(
    private readonly logger: ILogger,
    private readonly outputDir: string,
    concurrency?: number,
    private readonly runItemOverride?: (task: BatchTaskItem, idx: number, total: number) => Promise<void>,
  ) {
    this.concurrency = Math.max(1, concurrency ?? DEFAULT_CONCURRENCY);
  }

  async runBatch(tasks: BatchTaskItem[]): Promise<void> {
    if (tasks.length === 0) {
      this.logger.warn("批量任务为空");
      return;
    }
    this.logger.info(`开始批量采集，共${tasks.length}个站点，并发数=${this.concurrency}`);

    const queue = [...tasks];
    let index = 0;
    const running: Promise<void>[] = [];

    const startNext = async (): Promise<void> => {
      while (true) {
        const idx = index++;
        if (idx >= queue.length) break;
        await this.runItem(queue[idx], idx + 1, queue.length);
        if (idx < queue.length - 1) {
          await randomDelay(BROWSER_MASK_CONFIG.minDelayMs, BROWSER_MASK_CONFIG.maxDelayMs);
        }
      }
    };

    const workers = Math.min(this.concurrency, tasks.length);
    for (let i = 0; i < workers; i++) {
      running.push(startNext());
    }
    await Promise.all(running);

    this.logger.info("✅ 批量任务全部完成");
  }

  private async runItem(task: BatchTaskItem, idx: number, total: number) {
    try {
      if (this.runItemOverride) {
        await this.runItemOverride(task, idx, total);
      } else {
        const browser = new PlaywrightAdapter(this.logger);
        const storage = new CompositeStorageAdapter([
          new FileStorageAdapter(this.outputDir),
          new SqliteStorageAdapter(),
        ]);
        const svc = new HarvesterService(this.logger, browser, storage);
        await svc.harvest({
          targetUrl: task.targetUrl,
          actions: task.actions,
          elementSelectors: task.elementSelectors,
          jsScripts: task.jsScripts,
          networkCapture: task.networkCapture,
        });
      }
      this.logger.info(`[${idx}/${total}] 成功：${task.targetUrl}`);
    } catch (e) {
      this.logger.error(`[${idx}/${total}] 失败：${task.targetUrl}`, { err: (e as Error).message });
    }
  }
}
