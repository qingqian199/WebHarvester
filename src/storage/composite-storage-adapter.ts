import { IStorageAdapter } from "../core/ports/IStorageAdapter";
import { HarvestResult } from "../core/models";

/**
 * 复合存储适配器：包装多个 IStorageAdapter，依次调用 save()。
 * 用于同时写入文件系统 + SQLite 等场景。
 *
 * 用法：
 * ```ts
 * const storage = new CompositeStorageAdapter([
 *   new FileStorageAdapter(outputDir),
 *   new SqliteStorageAdapter(),
 * ]);
 * const svc = new HarvesterService(logger, browser, storage);
 * ```
 */
export class CompositeStorageAdapter implements IStorageAdapter {
  constructor(private readonly adapters: IStorageAdapter[]) {}

  async save(result: HarvestResult, outputFormat?: string): Promise<void> {
    await Promise.all(this.adapters.map((a) => a.save(result, outputFormat)));
  }
}
