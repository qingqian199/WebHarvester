import { generateTraceId } from "../utils/log-context";
import { classifyError, ErrorCategory } from "../utils/error-classifier";

// ── Types ──

export interface MonitorStep {
  name: string;
  startedAt: number;
  endedAt?: number;
  success: boolean;
  error?: { message: string; code?: string; stack?: string; category: ErrorCategory };
}

export interface CrawlTimeline {
  traceId: string;
  site: string;
  startedAt: number;
  endedAt?: number;
  overallStatus: "running" | "success" | "failed" | "partial";
  steps: MonitorStep[];
  labels: Record<string, string>; // e.g. { aid: "12345", keyword: "test" }
}

// ── Ring buffer store ──

const MAX_TRACE_IDS = 100;
const store = new Map<string, CrawlTimeline>();

function trimStore(): void {
  while (store.size > MAX_TRACE_IDS) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
}

// ── TaskMonitor ──

export class TaskMonitor {
  readonly timeline: CrawlTimeline;
  private currentStepIndex = -1;

  constructor(site: string, traceId?: string) {
    this.timeline = {
      traceId: traceId ?? generateTraceId(),
      site,
      startedAt: Date.now(),
      overallStatus: "running",
      steps: [],
      labels: {},
    };
    store.set(this.timeline.traceId, this.timeline);
    trimStore();
  }

  /** 设置追踪标签（URL 参数、aid、keyword 等）。 */
  setLabel(key: string, value: string): void {
    this.timeline.labels[key] = value;
  }

  /** 记录一个新步骤的开始。先前「正在运行」的步骤会被自动标记为失败。 */
  startStep(stepName: string): void {
    // 自动关闭前一个未结束的步骤
    const last = this.timeline.steps[this.currentStepIndex];
    if (last && last.endedAt === undefined) {
      last.endedAt = Date.now();
      last.success = false;
    }
    this.timeline.steps.push({
      name: stepName,
      startedAt: Date.now(),
      success: false,
    });
    this.currentStepIndex = this.timeline.steps.length - 1;
  }

  /** 结束当前步骤。 */
  endStep(success: boolean, error?: Error | { message: string; code?: string }): void {
    const step = this.timeline.steps[this.currentStepIndex];
    if (!step) return;
    step.endedAt = Date.now();
    step.success = success;
    if (error) {
      const message = error.message || String(error);
      const code = "code" in error ? (error as any).code : extractCodeFromMessage(message);
      const category = classifyError(message, code);
      step.error = {
        message,
        code,
        stack: error instanceof Error ? error.stack : undefined,
        category,
      };
    }
    this.updateOverallStatus();
  }

  /** 捕获异常并自动结束步骤。 */
  captureError(stepName: string, error: Error): Error {
    // 如果已经是当前步骤，直接结束
    const last = this.timeline.steps[this.currentStepIndex];
    if (last && last.name === stepName) {
      this.endStep(false, error);
    } else {
      // 否则新建一个失败步骤
      this.startStep(stepName);
      this.endStep(false, error);
    }
    return error;
  }

  /** 获取时间线副本。 */
  getTimeline(): CrawlTimeline {
    return { ...this.timeline, steps: [...this.timeline.steps] };
  }

  /** 获取 traceId。 */
  getTraceId(): string {
    return this.timeline.traceId;
  }

  /** 将监控绑定到某个 Promise，自动追踪成功/失败。 */
  wrap<T>(stepName: string, fn: () => Promise<T>): Promise<T> {
    this.startStep(stepName);
    return fn()
      .then((result) => {
        this.endStep(true);
        return result;
      })
      .catch((err: Error) => {
        this.endStep(false, err);
        throw err;
      });
  }

  private updateOverallStatus(): void {
    const steps = this.timeline.steps;
    const ended = steps.filter((s) => s.endedAt !== undefined);
    if (ended.length === 0) {
      this.timeline.overallStatus = "running";
      return;
    }
    const allSuccess = ended.every((s) => s.success);
    const anyFailed = ended.some((s) => !s.success);
    const anySuccess = ended.some((s) => s.success);
    if (allSuccess) {
      this.timeline.overallStatus = "success";
    } else if (anySuccess && anyFailed) {
      this.timeline.overallStatus = "partial";
    } else {
      this.timeline.overallStatus = "failed";
    }
    this.timeline.endedAt = Date.now();
  }

  /** 由 diagnose 完成时调用。 */
  finish(): void {
    if (this.timeline.endedAt === undefined) {
      this.timeline.endedAt = Date.now();
      this.updateOverallStatus();
    }
  }
}

// ── Store access ──

/** 获取指定 traceId 的时间线。 */
export function getTimeline(traceId: string): CrawlTimeline | undefined {
  return store.get(traceId);
}

/** 列出所有活跃的时间线（按开始时间倒序）。 */
export function listTimelines(limit = 20): CrawlTimeline[] {
  return Array.from(store.values())
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, limit);
}

/** 清理所有时间线。 */
export function clearTimelines(): void {
  store.clear();
}

// ── Helpers ──

function extractCodeFromMessage(message: string): string | undefined {
  // Match patterns like "code=-352", "status 403", "error -352"
  const m = message.match(/code[=:\s]*(-?\d+)/i) || message.match(/status[\s]*(\d{3})/i) || message.match(/\b(-?\d{3,})\b/);
  return m ? m[1] : undefined;
}
