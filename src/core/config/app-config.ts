import { z } from "zod";
import { BROWSER_MASK_CONFIG, DEFAULT_ACTION_TIMEOUT_MS, TASK_GLOBAL_TIMEOUT_MS, STORAGE_OUTPUT_DIR } from "./index";
import { RateLimitConfig, DEFAULT_RATE_LIMIT_CONFIG } from "../models/rate-limit";
import { FeatureFlagSet } from "../features";
import { ProxyPoolConfig } from "../ports/IProxyProvider";

const ConfigSchema = z.object({
  headless: z.boolean().default(true),
  browserMask: z.object({
    viewport: z.object({ width: z.number(), height: z.number() }),
    minDelayMs: z.number(),
    maxDelayMs: z.number(),
    enableHardwareMask: z.boolean(),
  }).default(BROWSER_MASK_CONFIG as any),
  actionTimeoutMs: z.number().int().positive().default(30000),
  taskTimeoutMs: z.number().int().positive().default(60000),
  captureAllNetwork: z.boolean().default(true),
  autoExtractAuth: z.boolean().default(true),
  autoExtractHiddenField: z.boolean().default(true),
  outputMd: z.boolean().default(true),
  outputCsv: z.boolean().default(false),
  outputDir: z.string().default("./output"),
  auth: z.object({
    loginUrl: z.string().optional(),
    verifyUrl: z.string().optional(),
    loggedInSelector: z.string().optional(),
    loggedOutSelector: z.string().optional(),
    qrLoginAutoSave: z.boolean().optional(),
  }).optional(),
  crawlOps: z.object({
    generateStubs: z.boolean().optional(),
    stubLanguage: z.enum(["python", "javascript"]).optional(),
  }).optional(),
  crawlers: z.record(z.string(), z.enum(["enabled", "disabled"])).optional(),
  features: z.record(z.string(), z.boolean()).optional(),
  rateLimit: z.object({
    enabled: z.boolean().optional(),
    minDelay: z.number().optional(),
    maxDelay: z.number().optional(),
    cooldownMinutes: z.number().optional(),
    maxConcurrentSignatures: z.number().optional(),
    maxConcurrentPages: z.number().optional(),
  }).optional(),
  jwtSecret: z.string().optional(),
  users: z.array(z.object({
    username: z.string(),
    passwordHash: z.string(),
    role: z.string().optional(),
  })).optional(),
  encrypted: z.object({
    masterKey: z.string().optional(),
    algorithm: z.string().optional(),
  }).optional(),
  proxyPool: z.object({
    enabled: z.boolean(),
    proxies: z.array(z.object({
      host: z.string(), port: z.number(), protocol: z.enum(["http", "https", "socks5"]),
      username: z.string().optional(), password: z.string().optional(),
    })),
    testUrl: z.string().optional(),
    healthCheckIntervalMs: z.number().int().positive().optional(),
  }).optional(),
});

export type ValidatedConfig = z.infer<typeof ConfigSchema>;

export function validateConfig(raw: unknown): ValidatedConfig {
  return ConfigSchema.parse(raw);
}

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
  auth?: {
    loginUrl?: string;
    verifyUrl?: string;
    loggedInSelector?: string;
    loggedOutSelector?: string;
    qrLoginAutoSave?: boolean;
  };
  crawlOps?: {
    generateStubs: boolean;
    stubLanguage: "python" | "javascript";
  };
  crawlers?: Record<string, "enabled" | "disabled">;
  rateLimit?: RateLimitConfig;
  features?: Partial<FeatureFlagSet>;
  proxyPool?: ProxyPoolConfig;
  jwtSecret?: string;
  users?: Array<{ username: string; passwordHash: string; role?: string }>;
  encrypted?: { masterKey?: string; algorithm?: string };
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
  concurrency?: number;
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
  outputDir: STORAGE_OUTPUT_DIR,
  crawlOps: {
    generateStubs: true,
    stubLanguage: "python",
  },
  crawlers: {
    xiaohongshu: "enabled",
    zhihu: "disabled",
    tiktok: "enabled",
  },
  rateLimit: DEFAULT_RATE_LIMIT_CONFIG,
};
