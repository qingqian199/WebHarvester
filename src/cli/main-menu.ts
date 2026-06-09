import inquirer from "inquirer";
import { HarvestConfig } from "../core/models";
import { FileSessionManager } from "../adapters/FileSessionManager";
import { loadAppConfig } from "../utils/config-loader";
import { FeatureFlags } from "../core/features";
import { getStatusInfo, renderStatusBar } from "./ui/status-bar";

export type MenuAction =
  | { type: "single"; config: HarvestConfig; profile?: string; saveSession: boolean; useChromeService?: boolean }
  | { type: "crawler-site"; site: string; url: string; profile?: string }
  | { type: "batch" }
  | { type: "login"; profile: string; loginUrl: string; verifyUrl: string }
  | { type: "qrcode"; profile: string; loginUrl: string; verifyUrl: string }
  | { type: "quick-article"; url: string; profile?: string }
  | { type: "analyze" }
  | { type: "gen-stub" }
  | { type: "export-comments" }
  | { type: "export-xhs-comments" }
  | { type: "view-sessions" }
  | { type: "web" }
  | { type: "backend-status" }
  | { type: "view-config" }
  | { type: "toggle-features" }
  | { type: "exit"; restart?: boolean };

export async function startMainMenu(_statusLine?: string): Promise<MenuAction> {
  const appCfg = await loadAppConfig();
  const enabledCrawlers = Object.entries(appCfg.crawlers ?? {})
    .filter(([, v]) => v === "enabled")
    .map(([k]) => k);

  // 顶部状态栏
  const status = getStatusInfo();
  console.log(`\n${"─".repeat(56)}`);
  console.log(`  WebHarvester v1.2  ${renderStatusBar(status)}`);
  console.log(`${"─".repeat(56)}\n`);

  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: "选择操作",
      choices: [
        new inquirer.Separator(" ⚡ 快速采集"),
        { name: "  ▶ 输入 URL 开始采集（自动匹配最优方式）", value: "quick-crawl" },
        new inquirer.Separator(" 📥 采集"),
        { name: "  1. 特化站点采集", value: "crawler" },
        ...(FeatureFlags.enableChromeService ? [{ name: "  2. 通用浏览器采集 (CDP)", value: "chrome_capture" }] : []),
        { name: "  3. 批量任务", value: "batch" },
        { name: "  4. 快速文章", value: "quick-article" },
        new inquirer.Separator(" 📊 数据"),
        { name: "  5. 查看采集结果", value: "analyze" },
        { name: "  6. 管理登录会话", value: "view-sessions" },
        { name: "  7. 导出数据（抖音/小红书评论→Excel）", value: "export-comments" },
        new inquirer.Separator(" ⚙️ 系统"),
        { name: "  8. Web 可视化面板", value: "web" },
        { name: "  9. 配置与功能开关", value: "view-config" },
        { name: "  0. 退出", value: "exit" },
      ],
    },
  ]);

  if (action === "quick-crawl") {
    // 快速采集：输入 URL → 自动匹配
    const { url } = await inquirer.prompt([{ type: "input", name: "url", message: "目标 URL：", validate: (v: string) => !!v.trim() }]);
    // 尝试匹配特化爬虫
    const domain = url
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "")
      .replace(/^www\./, "");
    const matched = enabledCrawlers.find((c) => {
      const map: Record<string, string[]> = {
        xiaohongshu: ["xiaohongshu.com"],
        zhihu: ["zhihu.com", "zhuanlan.zhihu.com"],
        bilibili: ["bilibili.com"],
        tiktok: ["tiktok.com"],
        boss_zhipin: ["zhipin.com"],
        douyin: ["douyin.com"],
        miyoushe: ["miyoushe.com"],
        xueshu: ["xueshu.baidu.com"],
      };
      return (map[c] || []).some((d) => domain.includes(d));
    });
    if (matched) {
      const list = await new FileSessionManager().listProfiles();
      const siteSessions = list.filter((s) => s.toLowerCase().includes(matched));
      let profile: string | undefined;
      if (siteSessions.length > 0) {
        const { useIt } = await inquirer.prompt([
          { type: "confirm", name: "useIt", message: `检测到${matched}会话：${siteSessions[0]}，使用？`, default: true },
        ]);
        if (useIt) profile = siteSessions[0];
      }
      return { type: "crawler-site", site: matched, url, profile };
    }
    // 无匹配 → 通用浏览器采集
    const config: HarvestConfig = { targetUrl: url, networkCapture: { captureAll: true, enhancedFullCapture: false } };
    return { type: "single", config, saveSession: false };
  }

  if (action === "crawler") {
    const sites = enabledCrawlers.length > 0 ? enabledCrawlers : ["xiaohongshu"];
    const { site } = await inquirer.prompt([{ type: "list", name: "site", message: "选择特化站点：", choices: sites }]);
    const { url } = await inquirer.prompt([{ type: "input", name: "url", message: "目标 URL：", validate: (v: string) => !!v.trim() }]);
    const list = await new FileSessionManager().listProfiles();
    const siteSessions = list.filter((s) => s.toLowerCase().includes(site));
    let profile: string | undefined;
    if (siteSessions.length > 0) {
      const { useIt } = await inquirer.prompt([{ type: "confirm", name: "useIt", message: `检测到会话：${siteSessions[0]}，使用？`, default: true }]);
      if (useIt) profile = siteSessions[0];
    }
    return { type: "crawler-site", site, url, profile };
  }

  if (action === "chrome_capture") {
    const { targetUrl } = await inquirer.prompt([{ type: "input", name: "targetUrl", message: "目标网址：", validate: (v: string) => !!v.trim() }]);
    const { device } = await inquirer.prompt([
      {
        type: "list",
        name: "device",
        message: "模拟设备：",
        choices: [
          { name: "💻 PC 端（默认）", value: "pc" },
          { name: "📱 iPhone", value: "iPhone" },
          { name: "📱 Android", value: "Android" },
        ],
      },
    ]);
    const isEnhanced = true;
    if (device !== "pc") console.log(`📱 已切换到${device}模式`);
    console.log("\n⚠️ 增强全量模式将捕获所有网络请求，结果文件可能较大。\n");
    const config: HarvestConfig = { targetUrl, networkCapture: { captureAll: true, enhancedFullCapture: isEnhanced }, device };
    return { type: "single", config, useChromeService: true, saveSession: false };
  }

  if (action === "view-sessions") return { type: "view-sessions" };
  if (action === "analyze") return { type: "analyze" };
  if (action === "export-comments") {
    const { sub } = await inquirer.prompt([
      {
        type: "list",
        name: "sub",
        message: "导出数据",
        choices: [
          { name: "  1. 导出抖音评论 → Excel", value: "dy" },
          { name: "  2. 导出小红书评论 → Excel", value: "xhs" },
        ],
      },
    ]);
    return { type: sub === "dy" ? "export-comments" : "export-xhs-comments" };
  }
  if (action === "web") return { type: "web" };
  if (action === "view-config") {
    const { sub } = await inquirer.prompt([
      {
        type: "list",
        name: "sub",
        message: "配置与工具",
        choices: [
          { name: "  1. 查看当前配置", value: "view" },
          { name: "  2. 切换功能开关", value: "toggle" },
          new inquirer.Separator(" 🔧 工具"),
          { name: "  3. 生成签名桩代码", value: "gen-stub" },
          { name: "  4. 后端服务状态", value: "backend" },
          new inquirer.Separator(" 🔐 登录"),
          { name: "  5. 账号密码登录", value: "login" },
          { name: "  6. 扫码登录", value: "qrcode" },
        ],
      },
    ]);
    if (sub === "view") return { type: "view-config" };
    if (sub === "toggle") return { type: "toggle-features" };
    if (sub === "gen-stub") return { type: "gen-stub" };
    if (sub === "backend") return { type: "backend-status" };
    if (sub === "login") {
      const ans = await inquirer.prompt([
        { type: "input", name: "profile", message: "会话保存名称：" },
        { type: "input", name: "loginUrl", message: "登录页面 URL：" },
        { type: "input", name: "verifyUrl", message: "验证登录状态 URL：" },
      ]);
      return { type: "login", ...ans };
    }
    if (sub === "qrcode") {
      const ans = await inquirer.prompt([
        { type: "input", name: "profile", message: "会话保存名称：" },
        { type: "input", name: "loginUrl", message: "登录页面 URL：" },
        { type: "input", name: "verifyUrl", message: "验证登录状态 URL：" },
      ]);
      return { type: "qrcode", ...ans };
    }
  }
  return { type: "exit" };
}

export async function runAnalyzeFromMenu() {
  const fs = await import("fs/promises");
  const path = await import("path");
  const outputDir = path.resolve("./output");
  try {
    const entries = await fs.readdir(outputDir, { withFileTypes: true });
    const jsonFiles: string[] = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const dirPath = path.join(outputDir, entry.name);
        const files = await fs.readdir(dirPath);
        for (const f of files) {
          if (f.endsWith(".json")) jsonFiles.push(path.join(dirPath, f));
        }
      }
    }
    if (jsonFiles.length === 0) {
      console.log("⚠️ output 目录中未找到采集结果 JSON 文件。\n");
      return;
    }
    console.log(`\n📂 找到 ${jsonFiles.length} 个采集结果文件：\n`);
    jsonFiles.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
    console.log("");
    const { idx } = await inquirer.prompt([{ type: "input", name: "idx", message: "输入编号查看分析报告（留空取消）：" }]);
    if (!idx || isNaN(Number(idx)) || Number(idx) < 1 || Number(idx) > jsonFiles.length) {
      console.log("已取消。\n");
      return;
    }
    const { ResultAnalyzer } = await import("../utils/analyzer");
    const raw = await fs.readFile(jsonFiles[Number(idx) - 1], "utf-8");
    const result: import("../core/models").HarvestResult = JSON.parse(raw);
    const summary = ResultAnalyzer.summarize(result);
    const html = ResultAnalyzer.generateHtmlReport(summary, result);
    const reportPath = path.resolve(`output/report-${result.traceId}.html`);
    await fs.writeFile(reportPath, html, "utf-8");
    console.log(`✅ 分析报告已生成：${reportPath}\n`);
  } catch (e) {
    console.log(`❌ 读取 output 目录失败：${(e as Error).message}\n`);
  }
}
