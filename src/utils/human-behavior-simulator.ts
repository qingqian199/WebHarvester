import { ConsoleLogger } from "../adapters/ConsoleLogger";

const logger = new ConsoleLogger("info");

export interface BehaviorConfig {
  minReadPauseMs?: number;
  maxReadPauseMs?: number;
  scrollBackProbability?: number;
  scrollSpeedRange?: [number, number];
  expandSelectors?: string[];
}

const SITE_BEHAVIOR: Record<string, BehaviorConfig> = {
  "xiaohongshu.com": {
    minReadPauseMs: 3000,
    maxReadPauseMs: 15000,
    scrollBackProbability: 0.15,
    scrollSpeedRange: [200, 800],
    expandSelectors: [".show-more", "[class*='loadMore']", "[class*='unfold']"],
  },
  "douyin.com": {
    minReadPauseMs: 2000,
    maxReadPauseMs: 8000,
    scrollBackProbability: 0.1,
    scrollSpeedRange: [300, 1000],
    expandSelectors: [".show-more", ".comment-more"],
  },
};

export interface SimulateOptions {
  expandSelectors?: string[];
  site?: string;
}

function bezierPoint(
  t: number,
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
): { x: number; y: number } {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

export class HumanBehaviorSimulator {
  /**
   * 使用贝塞尔曲线模拟自然鼠标移动轨迹。
   * @param page    Playwright Page
   * @param targetX 目标 X 坐标
   * @param targetY 目标 Y 坐标
   * @param steps   插值步数（默认 15-30 随机）
   * @param delay   每步间隔 ms（默认 10-20 随机）
   */
  async naturalMouseMove(
    page: any,
    targetX: number,
    targetY: number,
    steps?: number,
    delay?: number,
  ): Promise<void> {
    const stepsCount = steps ?? 15 + Math.floor(Math.random() * 15);
    const stepDelay = delay ?? 10 + Math.floor(Math.random() * 10);

    // 获取当前鼠标位置作为起点
    const start = await page.evaluate(() => {
      const ev = document.createEvent("MouseEvent");
      return { x: ev.clientX || 200, y: ev.clientY || 300 };
    }).catch(() => ({ x: 200, y: 300 }));

    // 生成随机控制点
    const dist = Math.sqrt((targetX - start.x) ** 2 + (targetY - start.y) ** 2);
    const offset = Math.max(50, dist * 0.2);
    const cp1 = {
      x: start.x + (targetX - start.x) * 0.3 + (Math.random() - 0.5) * offset,
      y: start.y + (targetY - start.y) * 0.2 + (Math.random() - 0.5) * offset,
    };
    const cp2 = {
      x: start.x + (targetX - start.x) * 0.7 + (Math.random() - 0.5) * offset,
      y: start.y + (targetY - start.y) * 0.8 + (Math.random() - 0.5) * offset,
    };

    for (let i = 1; i <= stepsCount; i++) {
      const t = i / stepsCount;
      const pt = bezierPoint(t, start, cp1, cp2, { x: targetX, y: targetY });
      try {
        await page.mouse.move(pt.x, pt.y);
      } catch {}
      await new Promise((r) => setTimeout(r, stepDelay));
    }
  }

  /**
   * 模拟自然点击：等待可见 → 滚动到位 → 鼠标移动 → 点击。
   */
  async naturalClick(page: any, selector: string): Promise<void> {
    try {
      await page.waitForSelector(selector, { timeout: 5000 });
    } catch {
      return;
    }

    const box = await page.$(selector).then((el: any) =>
      el?.boundingBox(),
    ).catch(() => null);
    if (!box) return;

    // 滚动到元素位置
    await page.evaluate((s: string) => {
      const el = document.querySelector(s);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, selector).catch(() => {});
    await new Promise((r) => setTimeout(r, 500 + Math.random() * 500));

    // 元素中心 + 随机偏移
    const offsetX = (Math.random() - 0.5) * box.width * 0.4;
    const offsetY = (Math.random() - 0.5) * box.height * 0.4;
    const centerX = box.x + box.width / 2 + offsetX;
    const centerY = box.y + box.height / 2 + offsetY;

    await this.naturalMouseMove(page, centerX, centerY);
    await new Promise((r) => setTimeout(r, 100 + Math.random() * 200));

    await page.click(selector, { delay: 50 + Math.floor(Math.random() * 100) }).catch(() => {});
    await new Promise((r) => setTimeout(r, 100 + Math.random() * 200));
  }

  /**
   * 自动滚动加载。每次滚动到底部，等待内容加载。
   * 页面高度不再变化时自动停止。
   */
  async autoScroll(page: any, maxRounds = 15, delay?: number): Promise<void> {
    for (let i = 0; i < maxRounds; i++) {
      const prevHeight = await page.evaluate(() => document.body.scrollHeight).catch(() => 0);

      await page.evaluate(() => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
      }).catch(() => {});

      const waitMs = delay ?? 1000 + Math.floor(Math.random() * 2000);
      await new Promise((r) => setTimeout(r, waitMs));

      const newHeight = await page.evaluate(() => document.body.scrollHeight).catch(() => 0);

      if (newHeight <= prevHeight) {
        logger.info(`自动滚动完成 (${i + 1} 轮)`);
        return;
      }
    }
    logger.info(`自动滚动已达上限 (${maxRounds} 轮)`);
  }

  /**
   * 轮询检测并点击展开按钮。
   */
  async clickExpandButtons(
    page: any,
    selectors: string[],
    maxRounds = 5,
    delay?: number,
  ): Promise<number> {
    let totalClicks = 0;

    for (let round = 0; round < maxRounds; round++) {
      let roundClicks = 0;

      for (const sel of selectors) {
        const buttons = await page.$$(sel).catch(() => []);
        for (const btn of buttons) {
          try {
            const visible = await btn.isVisible().catch(() => false);
            if (!visible) continue;
            const box = await btn.boundingBox().catch(() => null);
            if (!box) continue;

            const offsetX = (Math.random() - 0.5) * box.width * 0.4;
            const offsetY = (Math.random() - 0.5) * box.height * 0.4;
            const cx = box.x + box.width / 2 + offsetX;
            const cy = box.y + box.height / 2 + offsetY;

            await this.naturalMouseMove(page, cx, cy);
            await btn.click({ delay: 50 + Math.floor(Math.random() * 100) });
            roundClicks++;
            totalClicks++;
            await new Promise((r) => setTimeout(r, delay ?? 500 + Math.random() * 1000));
          } catch {}
        }
      }

      if (roundClicks === 0) break;
      // 等待新内容渲染
      await new Promise((r) => setTimeout(r, delay ?? 1000 + Math.random() * 1000));
    }

    if (totalClicks > 0) {
      logger.info(`展开按钮点击完成 (${totalClicks} 次)`);
    }
    return totalClicks;
  }

  /**
   * 完整的人机模拟流程：展开按钮 + 自动滚动 + 再次展开。
   * @param options 可传入 { expandSelectors, site } 以加载站点特定行为配置
   */
  async simulate(page: any, options?: SimulateOptions | string[]): Promise<void> {
    // 兼容旧调用方式：simulate(page, [...selectors])
    const opts: SimulateOptions = Array.isArray(options) ? { expandSelectors: options } : (options || {});
    const siteCfg = opts.site ? SITE_BEHAVIOR[opts.site] : undefined;
    const selectors = opts.expandSelectors || siteCfg?.expandSelectors || [];

    if (selectors.length > 0) {
      await this.clickExpandButtons(page, selectors);
    }
    const scrollDelay = siteCfg?.scrollSpeedRange
      ? siteCfg.scrollSpeedRange[0] + Math.floor(Math.random() * (siteCfg.scrollSpeedRange[1] - siteCfg.scrollSpeedRange[0]))
      : undefined;
    await this.autoScroll(page, undefined, scrollDelay);
    await new Promise((r) => setTimeout(r, 500));

    // 站点特定的阅读停顿（模拟用户浏览内容）
    if (siteCfg?.minReadPauseMs && siteCfg?.maxReadPauseMs) {
      const pause = siteCfg.minReadPauseMs + Math.random() * (siteCfg.maxReadPauseMs - siteCfg.minReadPauseMs);
      await new Promise((r) => setTimeout(r, pause));
    }

    // 概率性回滚（模拟用户回看）
    if (siteCfg?.scrollBackProbability && Math.random() < siteCfg.scrollBackProbability) {
      const scrollBack = Math.floor(Math.random() * 500) + 200;
      await page.evaluate((y: number) => window.scrollBy(0, -y), scrollBack);
      await new Promise((r) => setTimeout(r, 1000 + Math.random() * 2000));
    }

    if (selectors.length > 0) {
      await this.clickExpandButtons(page, selectors);
    }
  }
}
