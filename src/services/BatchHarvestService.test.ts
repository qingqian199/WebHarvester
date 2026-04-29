import { BatchHarvestService } from "./BatchHarvestService";
import { BatchTaskItem } from "../core/config/app-config";
import { ILogger } from "../core/ports/ILogger";

function stubLogger(): ILogger {
  return { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

describe("BatchHarvestService", () => {
  let logger: ILogger;

  beforeEach(() => {
    logger = stubLogger();
  });

  it("warns and returns for empty task list", async () => {
    const svc = new BatchHarvestService(logger, "/tmp/out");
    await svc.runBatch([]);
    expect(logger.warn).toHaveBeenCalledWith("批量任务为空");
  });

  it("runs a single task", async () => {
    const fn = jest.fn().mockResolvedValue(undefined);
    const svc = new BatchHarvestService(logger, "/tmp/out", undefined, fn);
    await svc.runBatch([{ targetUrl: "https://example.com" }]);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith({ targetUrl: "https://example.com" }, 1, 1);
  });

  it("runs all tasks in sequence", async () => {
    const fn = jest.fn().mockResolvedValue(undefined);
    const svc = new BatchHarvestService(logger, "/tmp/out", 1, fn);
    const tasks: BatchTaskItem[] = [
      { targetUrl: "https://a.com" },
      { targetUrl: "https://b.com" },
      { targetUrl: "https://c.com" },
    ];
    await svc.runBatch(tasks);
    expect(fn).toHaveBeenCalledTimes(3);
    expect(fn.mock.calls[0][0].targetUrl).toBe("https://a.com");
    expect(fn.mock.calls[2][0].targetUrl).toBe("https://c.com");
  });

  it("runs tasks concurrently up to concurrency limit", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const fn = jest.fn(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 50));
      inFlight--;
    });
    const svc = new BatchHarvestService(logger, "/tmp/out", 2, fn);
    await svc.runBatch([
      { targetUrl: "https://a.com" },
      { targetUrl: "https://b.com" },
      { targetUrl: "https://c.com" },
    ]);
    expect(maxInFlight).toBeLessThanOrEqual(2);
  });

  it("does not exceed task count in concurrency calc", async () => {
    const fn = jest.fn().mockResolvedValue(undefined);
    const svc = new BatchHarvestService(logger, "/tmp/out", 99, fn);
    await svc.runBatch([{ targetUrl: "https://a.com" }]);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("handles runItem failure gracefully", async () => {
    const fn = jest.fn().mockRejectedValue(new Error("fail"));
    const svc = new BatchHarvestService(logger, "/tmp/out", 1, fn);
    await expect(svc.runBatch([{ targetUrl: "https://a.com" }])).resolves.toBeUndefined();
  });
});
