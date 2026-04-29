import { HarvestResult } from "../models";

/** 采集结果存储适配器端口。负责将采集数据持久化到文件系统或其他介质。 */
export interface IStorageAdapter {
  /** 保存一次采集结果。outputFormat 控制输出格式（json/md/csv/har/all）。 */
  save(result: HarvestResult, outputFormat?: string): Promise<void>;
}
