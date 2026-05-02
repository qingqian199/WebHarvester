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
  minDelay: 1500,
  maxDelay: 4000,
  cooldownMinutes: 10,
  maxConcurrentSignatures: 1,
  maxConcurrentPages: 1,
};
