export {
  DEFAULT_ACTION_TIMEOUT_MS,
  SESSION_VALIDATE_TIMEOUT_MS,
  POST_NAVIGATION_IDLE_WAIT_MS,
  LOGIN_PAGE_LOAD_TIMEOUT_MS,
  REQUEST_CAPTURE_EXTRA_WAIT_MS,
} from "../constants/GlobalConstant";
export const TASK_GLOBAL_TIMEOUT_MS = 60000;
export const STORAGE_OUTPUT_DIR = "./output";

export const BROWSER_MASK_CONFIG = {
  viewport: { width: 1920, height: 1080 },
  minDelayMs: 300,
  maxDelayMs: 800,
  enableHardwareMask: true,
};
