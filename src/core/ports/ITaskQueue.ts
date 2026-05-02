export interface HarvestTask {
  id: string;
  site: string;
  url: string;
  units?: string[];
  params?: Record<string, string>;
  sessionName?: string;
  authMode?: string;
  priority?: number;
}

export interface TaskQueueStatus {
  pending: number;
  running: number;
  completed: number;
  failed: number;
}

export interface ITaskQueue {
  enqueue(task: HarvestTask): Promise<void>;
  dequeue(): Promise<HarvestTask | null>;
  onComplete(taskId: string, result: unknown): void;
  onError(taskId: string, error: Error): void;
  getStatus(): TaskQueueStatus;
  getResult(taskId: string): unknown;
  getError(taskId: string): string | undefined;
}
