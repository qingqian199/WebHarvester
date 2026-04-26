import { HarvestResult } from "../models";

export interface IStorageAdapter {
  save(result: HarvestResult, outputFormat?: string): Promise<void>;
}
