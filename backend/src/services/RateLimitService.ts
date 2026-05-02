/**
 * 限流令牌分发服务（预留）
 * 后续实现：多站点分级限流、自适应等待。
 */
export class RateLimitService {
  async acquire(_site: string): Promise<void> {}
}
