import { BatchHarvestService } from "../../services/BatchHarvestService";
import { loadBatchTasks } from "../../utils/batch-loader";
import { CliDeps } from "../types";

export async function handleBatchHarvest(deps: CliDeps): Promise<void> {
  const { tasks, concurrency } = await loadBatchTasks();
  if (tasks.length === 0) {
    deps.logger.warn("⚠️ tasks.json 中没有任务，请先配置");
    return;
  }
  const batch = new BatchHarvestService(deps.logger, deps.config.outputDir, concurrency);
  await batch.runBatch(tasks);
}
