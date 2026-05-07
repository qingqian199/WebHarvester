/** TLS/WAF/签名封锁异常。由 RetryMiddleware 或 fetchWithRetry 在检测到封锁时抛出。 */
export class TlsWafBlockError extends Error {
  public readonly url: string;
  public readonly wafType: string;
  public readonly errorCode?: number;

  constructor(url: string, wafType: string, errorCode?: number) {
    super(`TLS/WAF 封锁: ${wafType}${errorCode != null ? ` (code=${errorCode})` : ""}`);
    this.name = "TlsWafBlockError";
    this.url = url;
    this.wafType = wafType;
    this.errorCode = errorCode;
  }
}
