export function withGlobalTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((res, rej) => {
    const t = setTimeout(() => {
      rej(new Error(`任务全局超时 ${timeoutMs}ms`));
    }, timeoutMs);
    fn().then(res).catch(rej).finally(() => clearTimeout(t));
  });
}
