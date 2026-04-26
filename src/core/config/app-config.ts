import { BROWSER_MASK_CONFIG, DEFAULT_ACTION_TIMEOUT_MS, TASK_GLOBAL_TIMEOUT_MS, STORAGE_OUTPUT_DIR } from "./index";

export interface AppConfig {
  headless: boolean;
  browserMask: typeof BROWSER_MASK_CONFIG;
  actionTimeoutMs: number;
  taskTimeoutMs: number;
  captureAllNetwork: boolean;
  autoExtractAuth: boolean;
  autoExtractHiddenField: boolean;
  outputMd: boolean;
  outputCsv: boolean;
  outputDir: string;
}

export interface BatchTaskItem {
  targetUrl: string;
  elementSelectors?: string[];
  jsScripts?: string[] | Array<{ alias: string; script: string }>;
  actions?: Array<{
    type: "click" | "input" | "wait" | "navigate";
    selector?: string;
    value?: string;
    waitTime?: number;
  }>;
  networkCapture?: { captureAll: boolean };
}

export interface BatchTaskList {
  tasks: BatchTaskItem[];
}

export const DEFAULT_APP_CONFIG: AppConfig = {
  headless: true,
  browserMask: BROWSER_MASK_CONFIG,
  actionTimeoutMs: DEFAULT_ACTION_TIMEOUT_MS,
  taskTimeoutMs: TASK_GLOBAL_TIMEOUT_MS,
  captureAllNetwork: true,
  autoExtractAuth: true,
  autoExtractHiddenField: true,
  outputMd: true,
  outputCsv: true,
  outputDir: STORAGE_OUTPUT_DIR
};
