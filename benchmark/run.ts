/**
 * 性能基准脚本。
 * 使用 mock 浏览器适配器运行 HarvesterService，测量吞吐和延迟。
 *
 * 用法: npm run benchmark
 * 输出: P50 / P95 / P99 延迟（ms） + 内存峰值（MB）
 */
import { HarvesterService } from "../src/core/services/HarvesterService";
import { IBrowserAdapter } from "../src/core/ports/IBrowserAdapter";
import { IStorageAdapter } from "../src/core/ports/IStorageAdapter";
import { ILogger } from "../src/core/ports/ILogger";
import { HarvestConfig, NetworkRequest, ElementItem, StorageSnapshot } from "../src/core/models";

const ITERATIONS = 50;
const WARMUP = 5;

// ── Mock 数据 ──────────────────────────────────────────

function mockNetworkRequest(url: string): NetworkRequest {
  return {
    url, method: "GET", statusCode: 200,
    requestHeaders: { "content-type": "application/json" },
    requestBody: null, responseBody: "{}",
    timestamp: Date.now(), completedAt: Date.now() + 10,
  };
}

function mockElement(selector: string): ElementItem {
  return {
    selector, tagName: "div",
    attributes: { class: selector.replace(".", "") },
    text: "mock",
  };
}

const SAMPLE_REQUESTS = Array.from({ length: 200 }, (_, i) =>
  mockNetworkRequest(i < 50 ? `https://api.example.com/v1/data/${i}` : `https://static.example.com/bundle.${i}.js`),
);

const SAMPLE_ELEMENTS = Array.from({ length: 30 }, (_, i) => mockElement(`.el-${i}`));

const SAMPLE_STORAGE: StorageSnapshot = {
  localStorage: { token: "mock-token", "user.preferences": "{\"theme\":\"dark\"}" },
  sessionStorage: {},
  cookies: [{ name: "sid", value: "abc", domain: ".example.com" }],
};

const SAMPLE_CONFIG: HarvestConfig = {
  targetUrl: "https://www.bilibili.com/video/BV1test",
  actions: [{ type: "wait", waitTime: 100 }],
  elementSelectors: ["input", "form", "button"],
  networkCapture: { captureAll: true },
  storageTypes: ["localStorage", "sessionStorage", "cookies"],
};

// ── Mock 适配器 ────────────────────────────────────────

function stubLogger(): ILogger {
  return {
    debug: () => {}, info: () => {}, warn: () => {}, error: () => {},
    setTraceId: () => {},
  };
}

function stubBrowser(): IBrowserAdapter {
  return {
    launch: async () => {},
    performActions: async () => {},
    captureNetworkRequests: async () => SAMPLE_REQUESTS,
    queryElements: async () => SAMPLE_ELEMENTS,
    getStorage: async () => SAMPLE_STORAGE,
    executeScript: async <T>(_script: string) => "mock-value" as T,
    getPageMetrics: () => null,
    close: async () => {},
  };
}

function stubStorage(): IStorageAdapter {
  return { save: async () => {} };
}

// ── 基准逻辑 ───────────────────────────────────────────

function p(arr: number[], pct: number): number {
  const idx = Math.ceil((pct / 100) * arr.length) - 1;
  return arr[Math.max(0, idx)];
}

async function main() {
  const logger = stubLogger();
  const svc = new HarvesterService(logger, stubBrowser(), stubStorage());

  // warmup
  for (let i = 0; i < WARMUP; i++) await svc.harvest(SAMPLE_CONFIG);

  // measure
  const durs: number[] = [];
  const memBefore = process.memoryUsage().heapUsed / 1024 / 1024;

  for (let i = 0; i < ITERATIONS; i++) {
    const t0 = Date.now();
    await svc.harvest(SAMPLE_CONFIG);
    durs.push(Date.now() - t0);
  }

  const memAfter = process.memoryUsage().heapUsed / 1024 / 1024;

  durs.sort((a, b) => a - b);

  console.log("\n═══════════════════════════════════════");
  console.log("  WebHarvester 性能基准报告");
  console.log("═══════════════════════════════════════");
  console.log(`  迭代次数:       ${ITERATIONS}`);
  console.log(`  预热次数:       ${WARMUP}`);
  console.log(`  Mock 请求数:    ${SAMPLE_REQUESTS.length}`);
  console.log(`  Mock 元素数:    ${SAMPLE_ELEMENTS.length}`);
  console.log("───────────────────────────────────────");
  console.log(`  P50  (中位数):   ${p(durs, 50).toFixed(1)} ms`);
  console.log(`  P95:             ${p(durs, 95).toFixed(1)} ms`);
  console.log(`  P99:             ${p(durs, 99).toFixed(1)} ms`);
  console.log(`  平均延迟:       ${(durs.reduce((a, b) => a + b, 0) / durs.length).toFixed(1)} ms`);
  console.log(`  最快:           ${durs[0].toFixed(1)} ms`);
  console.log(`  最慢:           ${durs[durs.length - 1].toFixed(1)} ms`);
  console.log("───────────────────────────────────────");
  console.log(`  堆内存 (前):    ${memBefore.toFixed(1)} MB`);
  console.log(`  堆内存 (后):    ${memAfter.toFixed(1)} MB`);
  console.log(`  增量:          ${(memAfter - memBefore).toFixed(1)} MB`);
  console.log("═══════════════════════════════════════\n");
}

main().catch((e) => {
  console.error("基准运行失败:", e);
  process.exit(1);
});
