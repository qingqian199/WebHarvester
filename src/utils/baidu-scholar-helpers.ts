/**
 * 百度学术爬虫辅助函数。
 * 从 BaiduScholarCrawler 拆分，包含页面数据提取、CAPTCHA 检测和 Stealth 浏览器创建。
 */
import fs from "fs/promises";
import path from "path";
import { PlaywrightAdapter } from "../adapters/PlaywrightAdapter.js";
import { BrowserLifecycleManager } from "../adapters/BrowserLifecycleManager.js";
import { ConsoleLogger } from "../adapters/ConsoleLogger.js";
import { injectAntiDetection } from "../browser/anti-detection-injector.js";
import type { Page } from "playwright";

const _CAPTCHA_SCREENSHOT_DIR = "captcha_screenshots"; // ok: referenced in string literals below

/** 从搜索 API 的 paperList 中提取纸面字段。 */
export function extractPaperBasic(p: Record<string, any>): Record<string, any> {
  const authors = (p.authors || []).map((a: any) => a.showName || a.name || "").filter(Boolean);
  const authorAffs = (p.authors || []).map((a: any) => a.affiliate || "").filter(Boolean);
  const sources = (p.sourceList || []).map((s: any) => ({ url: s.url || "", name: s.anchor || "", domain: s.domain || "" }));
  // 尝试从 DOI 提取卷期页码: CNKI:SUN:JOURNAL.YEAR-ISSUE-PAGE
  let vol = "", issue = "", pages = "";
  const doi = p.doi || "";
  if (doi.startsWith("CNKI:SUN:")) {
    const parts = doi.split(".");
    if (parts.length >= 3) {
      const yearIssue = parts[1] || "";
      pages = parts.length >= 4 ? parts[parts.length - 1] : "";
      if (yearIssue.includes("-")) {
        vol = yearIssue.split("-")[0] || "";
        issue = yearIssue.split("-")[1] || "";
      }
    }
  }
  return {
    序号: 0,
    标题: (p.title || "").replace(/<\/?em>/g, ""),
    作者: authors.join("; "),
    作者单位: authorAffs.join("; "),
    发表年份: p.publishYear || "",
    期刊会议: p.publishInfo?.journalName || p.publishInfo?.publisher || "",
    卷: vol,
    期: issue,
    页码: pages,
    摘要: (p.abstract || "").replace(/<\/?em>/g, "").replace(/<\/?b>/g, ""),
    关键词: (p.keyword || "").replace(/<\/?em>/g, ""),
    DOI: doi,
    被引次数: p.cited ?? 0,
    下载量: "",
    基金项目: "",
    参考文献: "",
    作者邮箱: "",
    导师信息: "",
    论文分类号: "",
    原文链接: sources.map((s: any) => s.url).join("\n"),
    来源名称: sources.map((s: any) => s.name).join("; "),
    备注: "",
    _paperId: p.paperId || "",
  };
}

/** 从 detail 页检查是否有 CAPTCHA，如有则截图并提示。返回 true 表示被拦截。 */
export async function checkCaptcha(browser: PlaywrightAdapter, pid?: string, logger?: ConsoleLogger): Promise<boolean> {
  try {
    const title = await browser.executeScript<string>("document.title").catch(() => "") as unknown as string;
    const isCaptcha = title.includes("百度安全验证") || title.includes("安全验证");
    if (isCaptcha) {
      // 截图保存
      try {
        const dir = path.resolve("captcha_screenshots");
        await fs.mkdir(dir, { recursive: true });
        const page = browser.getLifecycleManager().getPage();
        if (page) {
          const filename = `baidu_captcha_${pid || Date.now()}_${Date.now()}.png`;
          await page.screenshot({ path: path.join(dir, filename), fullPage: false });
        }
      } catch {} // ok: ignored
      logger?.warn("  ⛔ 百度安全验证拦截，请手动打开详情页完成验证后按回车继续");
      logger?.warn("  💡 建议: 使用非 headless 模式 (headless: false) 可大幅降低触发概率");
    }
    return isCaptcha;
  } catch { return false; }
}

/**
 * 创建具有反检测能力的浏览器页面。
 * 降级链：headless=false（可视模式）→ headless=true（隐身模式）
 * 添加额外启动参数和初始化脚本以绕过 BIOS 检测。
 */
export async function createStealthPage(
  url: string,
  logger: ConsoleLogger,
): Promise<{ browser: PlaywrightAdapter; page: Page } | null> {
  // CI/测试环境跳过 headless=false（避免启动可视窗口）
  const modes = process.env.CI ? [true] : [false, true];
  for (const headless of modes) {
    try {
      const lcm = new BrowserLifecycleManager(logger);
      const page = await lcm.launch(
        url,
        headless,
        undefined,
        "domcontentloaded",
        headless ? 20000 : 5000,
      );

      await injectAntiDetection(page);

      const adapter = new PlaywrightAdapter(logger);
      adapter.replaceLifecycleManager(lcm);
      adapter.setPage(page);
      adapter.markPooled();

      logger.info(`  浏览器启动成功 (${headless ? "headless" : "可视模式"})`);
      return { browser: adapter, page };
    } catch (e) {
      logger.info(`  浏览器启动失败 (headless=${headless}): ${(e as Error).message}`);
    }
  }
  return null;
}
