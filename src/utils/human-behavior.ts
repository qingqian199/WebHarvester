export function randomDelay(min: number, max: number): Promise<void> {
  const d = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(r => setTimeout(r, d));
}

export function randomOffset(base: number, offset = 50): number {
  return base + Math.floor(Math.random() * offset);
}
