import type { Page } from "playwright";

export interface ScrollOptions {
  maxScrolls?: number;
  distanceRange?: [number, number];
  delayRange?: [number, number];
}

export interface MouseOptions {
  steps?: number;
  delayRange?: [number, number];
}

export interface TypingOptions {
  wpm?: number;
  typoRate?: number;
}

export interface SessionOptions {
  /** 是否启用 tabSwitch、resize 等高级行为（默认 false） */
  advanced?: boolean;
}

const DEFAULT_SCROLL: Required<ScrollOptions> = { maxScrolls: 4, distanceRange: [100, 600], delayRange: [500, 1500] };
const DEFAULT_MOUSE: Required<MouseOptions> = { steps: 8, delayRange: [200, 500] };
const DEFAULT_TYPING: Required<TypingOptions> = { wpm: 40, typoRate: 0.02 };

function rand(min: number, max: number): number { return Math.floor(Math.random() * (max - min + 1)) + min; }

async function safe(page: Page, fn: () => Promise<void>): Promise<void> {
  try { await fn(); } catch {}
}

// ── 基础模拟 ──

export async function simulateHumanScroll(page: Page, options?: ScrollOptions): Promise<void> {
  const opts = { ...DEFAULT_SCROLL, ...options };
  const count = rand(2, opts.maxScrolls);
  for (let i = 0; i < count; i++) {
    await safe(page, async () => {
      const deltaY = rand(opts.distanceRange[0], opts.distanceRange[1]);
      await page.mouse.wheel(0, deltaY);
    });
    await new Promise((r) => setTimeout(r, rand(opts.delayRange[0], opts.delayRange[1])));
  }
}

export async function simulateMouseMovement(page: Page, targetSelector?: string, options?: MouseOptions): Promise<void> {
  const opts = { ...DEFAULT_MOUSE, ...options };
  if (targetSelector) {
    await safe(page, async () => {
      const el = await page.$(targetSelector);
      if (el) {
        const box = await el.boundingBox();
        if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: opts.steps });
      }
    });
    await new Promise((r) => setTimeout(r, rand(opts.delayRange[0], opts.delayRange[1])));
    return;
  }
  const viewport = page.viewportSize() || { width: 1280, height: 720 };
  const count = rand(3, 5);
  for (let i = 0; i < count; i++) {
    const x = rand(50, viewport.width - 50);
    const y = rand(100, viewport.height - 100);
    await safe(page, () => page.mouse.move(x, y, { steps: opts.steps }));
    await new Promise((r) => setTimeout(r, rand(100, 300)));
  }
}

export async function simulateRandomClick(page: Page, targetSelector: string): Promise<void> {
  await simulateMouseMovement(page, targetSelector);
  await new Promise((r) => setTimeout(r, rand(100, 300)));
  await safe(page, () => page.click(targetSelector));
}

export async function simulateTyping(page: Page, selector: string, text: string, options?: TypingOptions): Promise<void> {
  const opts = { ...DEFAULT_TYPING, ...options };
  const charDelay = Math.round(60000 / (opts.wpm * 5));
  await safe(page, () => page.click(selector));
  await new Promise((r) => setTimeout(r, rand(200, 400)));
  for (let i = 0; i < text.length; i++) {
    const shouldTypo = Math.random() < opts.typoRate && i < text.length - 1;
    if (shouldTypo) {
      const wrongChar = String.fromCharCode(text.charCodeAt(i) + rand(1, 3));
      await safe(page, () => page.keyboard.type(wrongChar, { delay: rand(50, 100) }));
      await new Promise((r) => setTimeout(r, rand(200, 400)));
      await safe(page, () => page.keyboard.press("Backspace"));
      await new Promise((r) => setTimeout(r, rand(100, 200)));
    }
    await safe(page, () => page.keyboard.type(text[i], { delay: charDelay }));
  }
}

export async function simulateIdle(duration: number): Promise<void> {
  await new Promise((r) => setTimeout(r, duration));
}

// ── 高级模拟 ──

/**
 * 模拟拖拽：mousedown → mousemove → mouseup。
 * startSelector / endSelector 可传 CSS 选择器，也可传 {x, y} 坐标。
 */
export async function simulateDrag(
  page: Page,
  startSelector: string | { x: number; y: number },
  endSelector?: string | { x: number; y: number },
): Promise<void> {
  await safe(page, async () => {
    let startX: number, startY: number, endX: number, endY: number;

    if (typeof startSelector === "object") {
      startX = startSelector.x;
      startY = startSelector.y;
    } else {
      const el = await page.$(startSelector);
      if (!el) return;
      const box = await el.boundingBox();
      if (!box) return;
      startX = box.x + box.width / 2;
      startY = box.y + box.height / 2;
    }

    if (!endSelector) {
      endX = startX + rand(50, 150);
      endY = startY + rand(20, 80);
    } else if (typeof endSelector === "object") {
      endX = endSelector.x;
      endY = endSelector.y;
    } else {
      const el = await page.$(endSelector);
      if (!el) return;
      const box = await el.boundingBox();
      if (!box) return;
      endX = box.x + box.width / 2;
      endY = box.y + box.height / 2;
    }

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    const steps = rand(5, 10);
    for (let i = 1; i <= steps; i++) {
      const x = startX + (endX - startX) * (i / steps);
      const y = startY + (endY - startY) * (i / steps);
      await page.mouse.move(x, y);
      await new Promise((r) => setTimeout(r, rand(10, 30)));
    }
    await page.mouse.up();
  });
}

/**
 * 模拟 Tab 切换：触发 document.hidden = true → false，
 * 派发 visibilitychange 事件模拟用户切到其他标签再返回。
 */
export async function simulateTabSwitch(page: Page): Promise<void> {
  await safe(page, async () => {
    // 切走
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { get: () => true, configurable: true });
      Object.defineProperty(document, "visibilityState", { get: () => "hidden" as const, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await new Promise((r) => setTimeout(r, rand(1000, 3000)));
    // 切回
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { get: () => false, configurable: true });
      Object.defineProperty(document, "visibilityState", { get: () => "visible" as const, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await new Promise((r) => setTimeout(r, rand(200, 500)));
    // 恢复默认
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { get: () => false, configurable: true });
      Object.defineProperty(document, "visibilityState", { get: () => "visible" as const, configurable: true });
    });
  });
}

/**
 * 随机改变窗口大小再恢复，模拟用户调节窗口。
 */
export async function simulateResize(page: Page): Promise<void> {
  await safe(page, async () => {
    const orig = page.viewportSize() || { width: 1280, height: 720 };
    const newW = orig.width + rand(-100, 100);
    const newH = orig.height + rand(-80, 80);
    if (newW < 800 || newH < 400 || newW === orig.width || newH === orig.height) return;
    await page.setViewportSize({ width: newW, height: newH });
    await new Promise((r) => setTimeout(r, rand(300, 800)));
    await page.setViewportSize(orig);
    await new Promise((r) => setTimeout(r, rand(200, 400)));
  });
}

// ── 场景调度器 ──

/**
 * 场景调度器：根据强度级别执行一组行为模拟。
 * totalDuration 控制在 2~5 秒内。
 * @param advanced 是否启用 tabSwitch / resize 等高级行为（默认 false）
 */
export async function humanBehaviorSession(
  page: Page,
  intensity: "light" | "medium" | "heavy" | "off",
  options?: SessionOptions,
): Promise<void> {
  if (intensity === "off") return;
  const adv = options?.advanced ?? false;
  try {
    if (intensity === "light") {
      await simulateHumanScroll(page, { maxScrolls: 2, delayRange: [300, 800] });
    } else if (intensity === "medium") {
      await simulateHumanScroll(page, { maxScrolls: 2, delayRange: [400, 1000] });
      await simulateMouseMovement(page);
    } else if (intensity === "heavy") {
      await simulateHumanScroll(page, { maxScrolls: 3, delayRange: [500, 1200] });
      await simulateMouseMovement(page);
      // 随机悬停
      await safe(page, async () => {
        const els = await page.$$("a, p, h2, h3");
        if (els.length > 0) {
          const el = els[rand(0, els.length - 1)];
          const box = await el.boundingBox();
          if (box) {
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });
            await new Promise((r) => setTimeout(r, rand(500, 1000)));
          }
        }
      });
      // 高级行为
      if (adv) {
        await simulateDrag(page, { x: rand(100, 500), y: rand(100, 500) });
        await simulateTabSwitch(page);
        await simulateResize(page);
      }
    }
  } catch {}
}
