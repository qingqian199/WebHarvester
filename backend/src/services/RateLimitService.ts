/**
 * 限流状态查询服务。
 * 由 WebHarvester 主进程的 rate-limiter.ts 管理实际限流逻辑，
 * 后端服务仅提供状态查询接口。
 */
export class RateLimitService {
  private _sites: Record<string, { successRate: number; isPaused: boolean; backoffLevel: number }> = {};

  updateStatus(sites: Record<string, { successRate: number; isPaused: boolean; backoffLevel: number }>): void {
    this._sites = { ...sites };
  }

  getStatus(): { sites: Record<string, { successRate: number; isPaused: boolean; backoffLevel: number }> } {
    return { sites: { ...this._sites } };
  }

  async acquire(_site: string): Promise<void> {}
}
