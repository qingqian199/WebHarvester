import { EventEmitter } from "events";
import { ITaskQueue, HarvestTask, TaskQueueStatus } from "../core/ports/ITaskQueue";

const MAX_CONCURRENCY = 2;

export interface TaskStartedEvent { taskId: string; site: string; units?: string[] }
export interface TaskProgressEvent { taskId: string; unit: string; status: string; method: string; responseTime: number }
export interface TaskCompletedEvent { taskId: string; result: unknown }
export interface TaskFailedEvent { taskId: string; error: string }
export interface QueueChangedEvent { pending: number; running: number; completed: number; failed: number }

export class PQueueTaskQueue extends EventEmitter implements ITaskQueue {
  private pending: HarvestTask[] = [];
  private running = 0;
  private completed = 0;
  private failed = 0;
  private results = new Map<string, unknown>();
  private errors = new Map<string, string>();
  private maxConcurrency: number;
  private processTask: ((task: HarvestTask) => Promise<unknown>) | null = null;

  constructor(maxConcurrency = MAX_CONCURRENCY) {
    super();
    this.maxConcurrency = maxConcurrency;
  }

  setProcessor(fn: (task: HarvestTask) => Promise<unknown>): void {
    this.processTask = fn;
  }

  async enqueue(task: HarvestTask): Promise<void> {
    this.pending.push(task);
    this.pending.sort((a, b) => (a.priority ?? 5) - (b.priority ?? 5));
    this.emitQueueChanged();
    this.drain();
  }

  async dequeue(): Promise<HarvestTask | null> {
    if (this.pending.length === 0) return null;
    const task = this.pending.shift() ?? null;
    if (task) this.emitQueueChanged();
    return task;
  }

  onComplete(taskId: string, result: unknown): void {
    this.results.set(taskId, result);
    this.completed++;
    this.running--;
    this.emitTaskCompleted(taskId, result);
    this.emitQueueChanged();
    this.drain();
  }

  onError(taskId: string, error: Error): void {
    this.errors.set(taskId, error.message);
    this.failed++;
    this.running--;
    this.emitTaskFailed(taskId, error.message);
    this.emitQueueChanged();
    this.drain();
  }

  getStatus(): TaskQueueStatus {
    return {
      pending: this.pending.length,
      running: this.running,
      completed: this.completed,
      failed: this.failed,
    };
  }

  getResult(taskId: string): unknown {
    return this.results.get(taskId);
  }

  getError(taskId: string): string | undefined {
    return this.errors.get(taskId);
  }

  private drain(): void {
    if (!this.processTask) return;
    while (this.running < this.maxConcurrency && this.pending.length > 0) {
      const task = this.pending.shift()!;
      this.running++;
      this.emitTaskStarted(task);
      this.emitQueueChanged();
      this.processTask(task)
        .then((result) => this.onComplete(task.id, result))
        .catch((err: Error) => this.onError(task.id, err));
    }
  }

  private emitQueueChanged(): void {
    const status = this.getStatus();
    this.emit("queue:changed", status);
  }

  private emitTaskStarted(task: HarvestTask): void {
    this.emit("task:started", { taskId: task.id, site: task.site, units: task.units });
  }

  private emitTaskCompleted(taskId: string, result: unknown): void {
    this.emit("task:completed", { taskId, result });
  }

  private emitTaskFailed(taskId: string, error: string): void {
    this.emit("task:failed", { taskId, error });
  }
}
