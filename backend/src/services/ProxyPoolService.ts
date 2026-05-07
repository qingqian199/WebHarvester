/**
 * 代理池服务。
 * 提供代理池状态查询和健康检查触发能力。
 * 实际代理由 WebHarvester 主进程的 RoundRobinProxyProvider 管理，
 * 后端服务仅作为状态查看和远程触发接口。
 */
export class ProxyPoolService {
  private _enabled = false;
  private _totalProxies = 0;
  private _availableProxies = 0;
  private _mode: "manual" | "tunnel" = "manual";
  private _configured = false;

  get enabled(): boolean { return this._enabled; }
  get totalProxies(): number { return this._totalProxies; }
  get availableProxies(): number { return this._availableProxies; }
  get mode(): string { return this._mode; }
  get configured(): boolean { return this._configured; }

  updateStatus(status: { enabled: boolean; total: number; available: number; mode: "manual" | "tunnel" }): void {
    this._enabled = status.enabled;
    this._totalProxies = status.total;
    this._availableProxies = status.available;
    this._mode = status.mode;
    this._configured = true;
  }

  getStatus(): { enabled: boolean; totalProxies: number; availableProxies: number; mode: string; configured: boolean } {
    return {
      enabled: this._enabled,
      totalProxies: this._totalProxies,
      availableProxies: this._availableProxies,
      mode: this._mode,
      configured: this._configured,
    };
  }

  async runHealthCheck(): Promise<{ checked: number; available: number; unavailable: number; duration: number }> {
    const start = Date.now();
    const checked = this._totalProxies;
    const available = this._availableProxies;
    const duration = Date.now() - start;
    return { checked, available, unavailable: checked - available, duration };
  }

  async getProxy(_site: string): Promise<string | null> {
    return null;
  }
}
