import { RateLimitConfig, DEFAULT_RATE_LIMIT_CONFIG } from "../core/models/rate-limit";

export type { RateLimitConfig };

export const RATE_LIMIT_CODES: Record<string, number[]> = {
  bilibili: [-352],
  xiaohongshu: [300011],
  zhihu: [],
  tiktok: [10202, 10203, 10213, 10221],
};

/** 风控码分级映射。 */
export const RISK_LEVELS: Record<string, { level: "low" | "medium" | "high"; pauseMinutes: number }> = {
  "-352": { level: "high", pauseMinutes: 10 },
  "300011": { level: "high", pauseMinutes: 15 },
  "403": { level: "low", pauseMinutes: 1 },
  "429": { level: "medium", pauseMinutes: 5 },
};

const DEFAULT_WINDOW_SIZE = 100;

function expRandom(mean: number, min: number, max: number): number {
  const raw = Math.round(-mean * Math.log(1 - Math.random()));
  return Math.max(min, Math.min(max, raw));
}

class SiteRateLimiter {
  private lastRequestTime = 0;
  private cooldownUntil = 0;
  private config: RateLimitConfig;
  readonly site: string;

  /** 滑动窗口：最近请求的成功/失败记录。 true = 成功，false = 失败。 */
  private recentResults: boolean[] = [];
  private maxWindowSize: number;

  /** 全站延时倍数（medium 级别熔断时翻倍）。 */
  private delayMultiplier = 1;

  /** 端点级暂停（low 级别：只暂停特定端点）。key = 端点路径。 */
  private endpointPauseUntil: Map<string, number> = new Map();

  /** 端点级延时因子（low 级别递增）。 */
  private endpointDelayFactor: Map<string, number> = new Map();

  constructor(site: string, config?: Partial<RateLimitConfig>) {
    this.site = site;
    this.config = { ...DEFAULT_RATE_LIMIT_CONFIG, ...config };
    this.maxWindowSize = DEFAULT_WINDOW_SIZE;
  }

  updateConfig(config: Partial<RateLimitConfig>): void {
    this.config = { ...this.config, ...config };
  }

  get isEnabled(): boolean {
    return this.config.enabled;
  }

  get isPaused(): boolean {
    if (!this.config.enabled) return false;
    if (this.cooldownUntil === 0) return false;
    const now = Date.now();
    if (now >= this.cooldownUntil) {
      this.cooldownUntil = 0;
      return false;
    }
    return true;
  }

  get remainingCooldownMs(): number {
    if (this.cooldownUntil === 0) return 0;
    const remaining = this.cooldownUntil - Date.now();
    return remaining > 0 ? remaining : 0;
  }

  /** 记录本次请求成功/失败。 */
  recordResult(success: boolean): void {
    this.recentResults.push(success);
    if (this.recentResults.length > this.maxWindowSize) {
      this.recentResults.shift();
    }
  }

  /** 返回最近 N 次请求的成功率 (0~1)。若窗口为空则返回 1。 */
  getSuccessRate(): number {
    if (this.recentResults.length === 0) return 1;
    const successes = this.recentResults.filter(Boolean).length;
    return successes / this.recentResults.length;
  }

  /** 手动重置成功率统计（用于测试）。 */
  resetStats(): void {
    this.recentResults = [];
    this.delayMultiplier = 1;
    this.endpointPauseUntil.clear();
    this.endpointDelayFactor.clear();
  }

  /**
   * 自适应延时：
   * - 成功率 > 95% → 200-600ms（指数分布）
   * - 成功率 80-95% → 600-1500ms
   * - 成功率 < 80% → 1500-4000ms
   * - 可选 endpoint: 若有低级别暂停，等待该端点恢复
   */
  async throttle(endpoint?: string): Promise<void> {
    if (!this.config.enabled) return;

    // 检查端点级暂停
    if (endpoint) {
      const pauseUntil = this.endpointPauseUntil.get(endpoint);
      if (pauseUntil && Date.now() < pauseUntil) {
        const remaining = pauseUntil - Date.now();
        await new Promise((r) => setTimeout(r, remaining));
        return;
      }
    }

    const rate = this.getSuccessRate();
    let minDelay: number;
    let maxDelay: number;
    if (rate > 0.95) {
      minDelay = 200;
      maxDelay = 600;
    } else if (rate >= 0.8) {
      minDelay = 600;
      maxDelay = 1500;
    } else {
      minDelay = 1500;
      maxDelay = 4000;
    }

    // 端点级延时因子（low 级别递增）
    const factor = endpoint ? (this.endpointDelayFactor.get(endpoint) ?? 1) : 1;
    minDelay = Math.round(minDelay * factor);
    maxDelay = Math.round(maxDelay * factor);

    // 全站延时倍数（medium 级别）
    const mult = this.delayMultiplier;
    minDelay = Math.round(minDelay * mult);
    maxDelay = Math.round(maxDelay * mult);

    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    const mean = (minDelay + maxDelay) / 2;
    const desired = expRandom(mean, minDelay, maxDelay);
    if (elapsed < desired) {
      await new Promise((r) => setTimeout(r, desired - elapsed));
    }
    this.lastRequestTime = Date.now();
  }

  /**
   * 分级风控熔断。
   * - high: 全站暂停 pauseMinutes 分钟。
   * - medium: 延时翻倍，不暂停全站。
   * - low: 只暂停该端点，增加该端点的延时因子。
   * @returns true 表示已经处理（无需调用方额外处理）。
   */
  onRateLimitError(code: number, endpoint?: string): boolean {
    if (!this.config.enabled) return false;
    const entry = RISK_LEVELS[String(code)];
    if (!entry) {
      // 未识别的风控码：降级为 high
      const cooldownMs = this.config.cooldownMinutes * 60 * 1000;
      const jitter = Math.floor(Math.random() * cooldownMs * 0.5);
      this.cooldownUntil = Date.now() + cooldownMs + jitter;
      return true;
    }

    if (entry.level === "low" && endpoint) {
      // 只暂停该端点
      const pauseMs = entry.pauseMinutes * 60 * 1000;
      this.endpointPauseUntil.set(endpoint, Date.now() + pauseMs);
      // 递增该端点的延时因子（上限 4x）
      const current = this.endpointDelayFactor.get(endpoint) ?? 1;
      this.endpointDelayFactor.set(endpoint, Math.min(current * 2, 4));
      return true;
    }

    if (entry.level === "medium") {
      // 延时翻倍（上限 4x）
      this.delayMultiplier = Math.min(this.delayMultiplier * 2, 4);
      return true;
    }

    // high — 全站暂停
    const cooldownMs = entry.pauseMinutes * 60 * 1000;
    const jitter = Math.floor(Math.random() * cooldownMs * 0.5);
    this.cooldownUntil = Date.now() + cooldownMs + jitter;
    return true;
  }

  clearCooldown(): void {
    this.cooldownUntil = 0;
  }
}

const instances = new Map<string, SiteRateLimiter>();

export function getRateLimiter(site: string, config?: Partial<RateLimitConfig>): SiteRateLimiter {
  let rl = instances.get(site);
  if (!rl) {
    rl = new SiteRateLimiter(site, config);
    instances.set(site, rl);
  } else if (config) {
    rl.updateConfig(config);
  }
  return rl;
}

/** @deprecated Use `getRateLimiter(site).isPaused` instead. */
export function isSitePaused(site: string): boolean {
  return instances.get(site)?.isPaused ?? false;
}

export function clearAllCooldowns(): void {
  for (const rl of instances.values()) rl.clearCooldown();
}

export { SiteRateLimiter };
