export interface RateLimitConfig {
  enabled: boolean;
  minDelay: number;
  maxDelay: number;
  cooldownMinutes: number;
  maxConcurrentSignatures: number;
  maxConcurrentPages: number;
}

export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  enabled: true,
  minDelay: 500,
  maxDelay: 1500,
  cooldownMinutes: 10,
  maxConcurrentSignatures: 2,
  maxConcurrentPages: 1,
};
