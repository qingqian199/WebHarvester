import chalk from "chalk";
import cliProgress from "cli-progress";

const isTTY = process.stdout.isTTY ?? false;

export function isInteractive(): boolean {
  return isTTY;
}

/** 带颜色的日志输出。非 TTY 时降级为纯文本。 */
export function coloredLog(level: "info" | "success" | "warn" | "error" | "debug", message: string): void {
  const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  if (!isTTY) {
    fn(`[${level.toUpperCase()}] ${message}`);
    return;
  }
  const colorMap: Record<string, chalk.Chalk> = {
    info: chalk.white,
    success: chalk.green,
    warn: chalk.yellow,
    error: chalk.red,
    debug: chalk.gray,
  };
  const colorFn = colorMap[level] || chalk.white;
  const tag = level.toUpperCase();
  fn(colorFn(`[${tag}] ${message}`));
}

/** 创建并启动进度条。返回 { update, stop } 控制句柄。非 TTY 时返回 noop 对象。 */
export function createProgressBar(total: number, label = "采集进度"): { update: (done: number) => void; stop: () => void } {
  if (!isTTY || total === 0) {
    return {
      update: (done: number) => {
        if (done <= total) {
          console.log(`[进度] ${label}: ${done}/${total}`);
        }
      },
      stop: () => {},
    };
  }

  const bar = new cliProgress.SingleBar({
    format: `${label} | {bar} | {percentage}% | {value}/{total} 单元 | 耗时: {duration_formatted}`,
    barCompleteChar: "█",
    barIncompleteChar: "░",
    hideCursor: true,
    clearOnComplete: true,
  }, cliProgress.Presets.shades_classic);

  bar.start(total, 0);

  return {
    update: (done: number) => bar.update(done),
    stop: () => {
      bar.stop();
    },
  };
}

/** 使用进度条包裹异步任务。 */
export async function withProgress<T>(items: T[], processor: (item: T, index: number) => Promise<unknown>, label?: string): Promise<void> {
  if (items.length === 0) return;
  const bar = createProgressBar(items.length, label);
  for (let i = 0; i < items.length; i++) {
    await processor(items[i], i);
    bar.update(i + 1);
  }
  bar.stop();
}

/** 高亮标题文本。 */
export function highlightTitle(text: string): string {
  if (!isTTY) return text;
  return chalk.bold.cyan(text);
}

/** 高亮选中项。 */
export function highlightOption(text: string): string {
  if (!isTTY) return text;
  return chalk.green(text);
}

/** 错误标签。 */
export function errorLabel(text: string): string {
  if (!isTTY) return `❌ ${text}`;
  return chalk.red(`❌ ${text}`);
}

/** 成功标签。 */
export function successLabel(text: string): string {
  if (!isTTY) return `✅ ${text}`;
  return chalk.green(`✅ ${text}`);
}

/** 警告标签。 */
export function warnLabel(text: string): string {
  if (!isTTY) return `⚠️ ${text}`;
  return chalk.yellow(`⚠️ ${text}`);
}
