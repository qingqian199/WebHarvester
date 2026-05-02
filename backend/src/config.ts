export interface BackendConfig {
  port: number;
  host: string;
  stokenRefreshMs: number;
  bootstrapUrl: string;
  headless: boolean;
}

export const DEFAULT_CONFIG: BackendConfig = {
  port: 3001,
  host: "0.0.0.0",
  stokenRefreshMs: 25 * 60 * 1000,
  bootstrapUrl: "https://www.zhipin.com/web/geek/jobs",
  headless: true,
};

export function loadConfig(): BackendConfig {
  const env = process.env;
  return {
    port: parseInt(env.BACKEND_PORT ?? "", 10) || DEFAULT_CONFIG.port,
    host: env.BACKEND_HOST || DEFAULT_CONFIG.host,
    stokenRefreshMs: parseInt(env.STOKEN_REFRESH_MS ?? "", 10) || DEFAULT_CONFIG.stokenRefreshMs,
    bootstrapUrl: env.BOOTSTRAP_URL || DEFAULT_CONFIG.bootstrapUrl,
    headless: env.HEADLESS !== "false",
  };
}
