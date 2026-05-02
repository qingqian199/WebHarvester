/**
 * 代理池服务（预留）
 * 后续实现：加权轮询、健康检查、不可用池管理。
 */
export class ProxyPoolService {
  async getProxy(_site: string): Promise<string | null> {
    return null;
  }
}
