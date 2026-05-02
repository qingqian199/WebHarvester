export interface ProxyConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  protocol: "http" | "https" | "socks5";
}

export interface ProxyPoolConfig {
  enabled: boolean;
  proxies: ProxyConfig[];
  testUrl?: string;
  healthCheckIntervalMs?: number;
}

export interface IProxyProvider {
  /** 为指定站点获取一个代理。site 可用于按站点分流。 */
  getProxy(site?: string): Promise<ProxyConfig | null>;
  /** 上报代理失败，内部减少权重或临时移除。 */
  reportFailure(proxy: ProxyConfig, error: Error): void;
  /** 返回当前可用代理列表。 */
  listProxies(): ProxyConfig[];
  /** 代理总开关。 */
  readonly enabled: boolean;
  /** 对全部代理执行预热探测（并发），标记可用/不可用。 */
  warmup(): Promise<void>;
  /** 启动定期健康检查（会在内部 setInterval），返回 this 便于链式调用。 */
  startHealthCheck(): this;
  /** 停止健康检查定时器。 */
  stopHealthCheck(): void;
  /** 返回当前可用代理数量 */
  readonly enabledCount: number;
}
