export function generateTraceId(): string {
  const now = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `${now}_${rand}`;
}

export function withGlobalTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`任务全局超时 ${timeoutMs}ms`)), timeoutMs);
    fn().then(res).catch(rej).finally(() => clearTimeout(t));
  });
}

export function filterEmptySelectors(selectors: string[]): string[] {
  return selectors.filter(s => typeof s === "string" && s.trim());
}
