import { request as httpRequest } from "http";
import { request as httpsRequest } from "https";
import { IProxyProvider, ProxyConfig, ProxyPoolConfig } from "../core/ports/IProxyProvider";

interface ProxyHealth {
  weight: number;
  latencyMs: number;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  available: boolean;
}

function proxyKey(p: ProxyConfig): string {
  return `${p.protocol}://${p.host}:${p.port}`;
}

function latencyToWeight(latencyMs: number): number {
  if (latencyMs < 1000) return 3;
  if (latencyMs < 2000) return 2;
  return 1;
}

const DEFAULT_TEST_URL = "http://httpbin.org/ip";
const DEFAULT_HEALTH_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const MAX_LATENCY_MS = 5000;
const MAX_CONSECUTIVE_DEMOTE = 2;
const MAX_CONSECUTIVE_PROMOTE = 2;
const MAX_FAILURES_AT_MIN_WEIGHT = 3;

export type ProbeFn = (proxy: ProxyConfig, testUrl: string) => Promise<{ success: boolean; latencyMs: number }>;

export const defaultProbe: ProbeFn = async (proxy, testUrl) => {
  const start = Date.now();
  const urlObj = new URL(testUrl.startsWith("http") ? testUrl : `http://${testUrl}`);
  const isHttps = urlObj.protocol === "https:";
  const mod = isHttps ? httpsRequest : httpRequest;
  try {
    await new Promise<void>((resolve, reject) => {
      const req = mod(
        {
          method: "GET",
          hostname: proxy.host,
          port: proxy.port,
          path: urlObj.pathname + urlObj.search,
          headers: {
            Host: urlObj.hostname,
            "User-Agent": "Mozilla/5.0",
            ...(proxy.username ? { "Proxy-Authorization": "Basic " + Buffer.from(`${proxy.username}:${proxy.password}`).toString("base64") } : {}),
          },
          timeout: MAX_LATENCY_MS,
          rejectUnauthorized: false,
        },
        (res) => {
          if (res.statusCode === 200) resolve();
          else reject(new Error(`status ${res.statusCode}`));
          res.resume();
        },
      );
      req.on("error", reject);
      req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
      req.end();
    });
    const latencyMs = Date.now() - start;
    return { success: true, latencyMs };
  } catch {
    return { success: false, latencyMs: Date.now() - start };
  }
};

export class RoundRobinProxyProvider implements IProxyProvider {
  readonly enabled: boolean;
  private allProxies: ProxyConfig[];
  private availableProxies: ProxyConfig[];
  private unavailableProxies: ProxyConfig[];
  private health: Map<string, ProxyHealth>;
  private testUrl: string;
  private healthCheckIntervalMs: number;
  private healthTimer: ReturnType<typeof setInterval> | null = null;
  private warmupPromise: Promise<void> | null = null;
  private probeFn: ProbeFn;

  constructor(config?: ProxyPoolConfig, probeFn?: ProbeFn) {
    this.enabled = config?.enabled ?? false;
    this.allProxies = config?.proxies ?? [];
    this.availableProxies = [...this.allProxies];
    this.unavailableProxies = [];
    this.health = new Map();
    this.testUrl = config?.testUrl ?? DEFAULT_TEST_URL;
    this.healthCheckIntervalMs = config?.healthCheckIntervalMs ?? DEFAULT_HEALTH_CHECK_INTERVAL_MS;
    this.probeFn = probeFn ?? defaultProbe;
    for (const p of this.allProxies) {
      this.health.set(proxyKey(p), { weight: 1, latencyMs: 0, consecutiveFailures: 0, consecutiveSuccesses: 0, available: true });
    }
  }

  get enabledCount(): number {
    return this.availableProxies.length;
  }

  async warmup(): Promise<void> {
    if (!this.enabled || this.allProxies.length === 0) return;
    const tasks = this.allProxies.map(async (proxy) => {
      const result = await this.probeFn(proxy, this.testUrl);
      this.applyProbeResult(proxy, result);
    });
    this.warmupPromise = Promise.allSettled(tasks).then(() => {});
    await this.warmupPromise;
  }

  /** 返回 warmup 完成后的 Promise（用于等待预热完成后再分配任务）。 */
  waitWarmup(): Promise<void> {
    return this.warmupPromise ?? Promise.resolve();
  }

  startHealthCheck(): this {
    if (!this.enabled || this.healthTimer) return this;
    this.healthTimer = setInterval(() => {
      this.runHealthCheck().catch(() => {});
    }, this.healthCheckIntervalMs);
    // allow process to exit even if timer is still active
    if (typeof this.healthTimer === "object" && "unref" in this.healthTimer) {
      this.healthTimer.unref();
    }
    return this;
  }

  stopHealthCheck(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
  }

  private async runHealthCheck(): Promise<void> {
    if (!this.enabled) return;
    const allToCheck = [
      ...this.availableProxies.map(p => ({ proxy: p, currentlyAvailable: true })),
      ...this.unavailableProxies.map(p => ({ proxy: p, currentlyAvailable: false })),
    ];
    await Promise.allSettled(
      allToCheck.map(async ({ proxy, currentlyAvailable }) => {
        const result = await this.probeFn(proxy, this.testUrl);
        const key = proxyKey(proxy);
        const h = this.health.get(key);
        if (!h) return;
        if (result.success && result.latencyMs < MAX_LATENCY_MS) {
          h.consecutiveSuccesses++;
          h.consecutiveFailures = 0;
          h.latencyMs = result.latencyMs;
          h.weight = latencyToWeight(result.latencyMs);
          if (!currentlyAvailable && h.consecutiveSuccesses >= MAX_CONSECUTIVE_PROMOTE) {
            h.available = true;
            this.moveProxy(proxy, this.unavailableProxies, this.availableProxies);
          }
        } else {
          h.consecutiveFailures++;
          h.consecutiveSuccesses = 0;
          if (currentlyAvailable && h.consecutiveFailures >= MAX_CONSECUTIVE_DEMOTE) {
            h.available = false;
            h.weight = 1;
            this.moveProxy(proxy, this.availableProxies, this.unavailableProxies);
          }
        }
      }),
    );
  }

  private applyProbeResult(proxy: ProxyConfig, result: { success: boolean; latencyMs: number }): void {
    const key = proxyKey(proxy);
    const h = this.health.get(key);
    if (!h) return;
    if (result.success && result.latencyMs < MAX_LATENCY_MS) {
      h.available = true;
      h.latencyMs = result.latencyMs;
      h.weight = latencyToWeight(result.latencyMs);
      h.consecutiveFailures = 0;
      h.consecutiveSuccesses = 1;
      this.moveProxy(proxy, this.unavailableProxies, this.availableProxies);
    } else {
      h.available = false;
      h.latencyMs = result.latencyMs;
      h.weight = 1;
      h.consecutiveFailures = 1;
      h.consecutiveSuccesses = 0;
      this.moveProxy(proxy, this.availableProxies, this.unavailableProxies);
    }
  }

  private moveProxy(proxy: ProxyConfig, from: ProxyConfig[], to: ProxyConfig[]): void {
    const idx = from.findIndex(p => p.host === proxy.host && p.port === proxy.port);
    if (idx !== -1) from.splice(idx, 1);
    if (!to.some(p => p.host === proxy.host && p.port === proxy.port)) {
      to.push(proxy);
    }
  }

  async getProxy(_site?: string): Promise<ProxyConfig | null> {
    if (!this.enabled) return null;
    if (this.warmupPromise) await this.warmupPromise;
    if (this.availableProxies.length === 0) return null;
    const totalWeight = this.availableProxies.reduce((sum, p) => {
      const h = this.health.get(proxyKey(p));
      return sum + (h?.weight ?? 1);
    }, 0);
    let rand = Math.random() * totalWeight;
    for (const proxy of this.availableProxies) {
      const h = this.health.get(proxyKey(proxy));
      const w = h?.weight ?? 1;
      rand -= w;
      if (rand <= 0) return proxy;
    }
    return this.availableProxies[this.availableProxies.length - 1];
  }

  reportFailure(proxy: ProxyConfig, _error: Error): void {
    const key = proxyKey(proxy);
    const h = this.health.get(key);
    if (!h) return;
    h.consecutiveFailures++;
    h.consecutiveSuccesses = 0;
    h.weight = Math.max(1, h.weight - 1);
    if (h.weight <= 1 && h.consecutiveFailures >= MAX_FAILURES_AT_MIN_WEIGHT) {
      h.available = false;
      this.moveProxy(proxy, this.availableProxies, this.unavailableProxies);
    }
  }

  listProxies(): ProxyConfig[] {
    return [...this.availableProxies];
  }

  /** 返回所有代理（可用 + 不可用），用于监控。 */
  listAllProxies(): ProxyConfig[] {
    return [...this.availableProxies, ...this.unavailableProxies];
  }

  /** 返回代理健康信息。 */
  getHealth(): Map<string, ProxyHealth> {
    return new Map(this.health);
  }

  resetFailures(): void {
    for (const [, h] of this.health) {
      h.consecutiveFailures = 0;
      h.consecutiveSuccesses = 0;
    }
  }

  destroy(): void {
    this.stopHealthCheck();
  }
}
