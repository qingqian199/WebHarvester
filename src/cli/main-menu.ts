import inquirer from "inquirer";
import { HarvestConfig } from "../core/models";
import { FileSessionManager } from "../adapters/FileSessionManager";
import { loadAppConfig } from "../utils/config-loader";

export type MenuAction =
    | { type: "single"; config: HarvestConfig; profile?: string; saveSession: boolean }
    | { type: "crawler-site"; site: string; url: string; profile?: string }
    | { type: "batch" }
    | { type: "login"; profile: string; loginUrl: string; verifyUrl: string }
    | { type: "qrcode"; profile: string; loginUrl: string; verifyUrl: string }
    | { type: "quick-article"; url: string; profile?: string }
    | { type: "analyze" }
    | { type: "gen-stub" }
    | { type: "view-sessions" }
    | { type: "web" }
    | { type: "view-config" }
    | { type: "toggle-features" }
    | { type: "exit" };

export async function startMainMenu(): Promise<MenuAction> {
    const appCfg = await loadAppConfig();
    const enabledCrawlers = Object.entries(appCfg.crawlers ?? {})
        .filter(([, v]) => v === "enabled")
        .map(([k]) => k);

    const { action } = await inquirer.prompt([
        {
            type: "list", name: "action", message: "🌐 WebHarvester 主菜单",
            choices: [
                new inquirer.Separator(" 📌 采集模式"),
                { name: "  1. 通用站点探测", value: "single" },
                ...(enabledCrawlers.length > 0
                    ? [{ name: `  2. 特化站点采集（${enabledCrawlers.join("/")}）`, value: "crawler" }]
                    : []),
                { name: "  3. 批量任务", value: "batch" },
                new inquirer.Separator(" 🔐 登录与会话"),
                { name: "  4. 账号密码登录", value: "login" },
                { name: "  5. 扫码登录", value: "qrcode" },
                new inquirer.Separator(" 📊 离线分析"),
                { name: "  6. 分析已有采集结果", value: "analyze" },
                { name: "  7. 生成签名桩代码", value: "gen-stub" },
                { name: "  8. 查看已存会话", value: "view-sessions" },
                new inquirer.Separator(" 🌍 服务"),
                { name: "  9. 启动 Web 可视化面板", value: "web" },
                new inquirer.Separator(" ⚙️ 配置"),
                { name: " 10. 查看当前配置", value: "view-config" },
                { name: " 11. 切换功能开关", value: "toggle-features" },
                { name: "  0. 退出", value: "exit" },
            ]
        }
    ]);

    if (action === "crawler") {
        const sites = enabledCrawlers.length > 0 ? enabledCrawlers : ["xiaohongshu"];
        const { site, url } = await inquirer.prompt([
            { type: "list", name: "site", message: "选择特化站点：", choices: sites },
            { type: "input", name: "url", message: "目标 URL：", validate: (v: string) => !!v.trim() },
        ]);
        const list = await new FileSessionManager().listProfiles();
        const siteSessions = list.filter(s => s.toLowerCase().includes(site) || s === site);
        let profile: string | undefined;
        if (siteSessions.length > 0) {
            const { useIt } = await inquirer.prompt([{ type: "confirm", name: "useIt", message: `检测到会话：${siteSessions[0]}，使用？`, default: true }]);
            if (useIt) profile = siteSessions[0];
        }
        return { type: "crawler-site", site, url, profile };
    }

    if (action === "single") {
        const { mode } = await inquirer.prompt([{ type: "list", name: "mode", message: "选择采集模式：", choices: [
            { name: "🔍 快速探测（仅主文档和关键信息）", value: "quick" },
            { name: "📦 全量采集（捕获所有网络请求和完整数据）", value: "full" },
            { name: "🔬 全量采集（增强版，捕获 XHR/Fetch + 所有资源）", value: "enhanced" },
        ]}]);
        const ans = await inquirer.prompt([
            { type: "input", name: "targetUrl", message: "目标网址：", validate: v => !!v.trim() },
            ...(mode === "quick" ? [{
                type: "checkbox" as const, name: "captureItems" as const, message: "采集内容", choices: [
                    { name: "全量网络请求", value: "network", checked: true },
                    { name: "DOM 元素", value: "element", checked: true },
                    { name: "Cookie/存储", value: "storage", checked: true }
                ]
            }] : []),
        ]);
        const isEnhanced = mode === "enhanced";
        const config: import("../core/models").HarvestConfig = {
            targetUrl: ans.targetUrl.trim(),
            networkCapture: { captureAll: mode === "full" || mode === "enhanced" || true, enhancedFullCapture: isEnhanced },
            ...(mode === "quick" ? {
                elementSelectors: ["input", "input[type=\"hidden\"]", "form", "button", "textarea", "select"],
                storageTypes: ["localStorage", "sessionStorage", "cookies"] as const,
            } : {}),
        };
        if (isEnhanced) {
            console.log("\n⚠️ 增强全量模式将捕获页面所有网络请求（XHR/Fetch/静态资源），结果文件可能较大。\n");
        }
        const { useProfile } = await inquirer.prompt([{ type: "confirm", name: "useProfile", message: "是否使用/保存登录会话？", default: false }]);
        let profile: string | undefined;
        let saveSession = false;
        if (useProfile) {
            const list = await new FileSessionManager().listProfiles();
            const choices = [...list.map(p => ({ name: `已存会话：${p}`, value: p })), { name: "➕ 新建会话", value: "__new__" }];
            const { prof } = await inquirer.prompt([{ type: "list", name: "prof", message: "选择会话", choices }]);
            if (prof === "__new__") {
                const { newName } = await inquirer.prompt([{ type: "input", name: "newName", message: "新会话名称：" }]);
                profile = newName; saveSession = true;
            } else { profile = prof; saveSession = false; }
        }
        return { type: "single", config, profile, saveSession };
    }

    if (action === "login") {
        const ans = await inquirer.prompt([
            { type: "input", name: "profile", message: "会话保存名称：" },
            { type: "input", name: "loginUrl", message: "登录页面 URL：" },
            { type: "input", name: "verifyUrl", message: "验证登录状态 URL：" }
        ]);
        return { type: "login", ...ans };
    }

    if (action === "qrcode") {
        const ans = await inquirer.prompt([
            { type: "input", name: "profile", message: "会话保存名称：" },
            { type: "input", name: "loginUrl", message: "登录页面 URL：" },
            { type: "input", name: "verifyUrl", message: "验证登录状态 URL：" }
        ]);
        return { type: "qrcode", ...ans };
    }

    if (action === "quick-article") {
        const { url, useProfile } = await inquirer.prompt([
            { type: "input", name: "url", message: "文章 URL：" },
            { type: "confirm", name: "useProfile", message: "使用已存登录会话？", default: false }
        ]);
        let profile: string | undefined;
        if (useProfile) {
            const list = await new FileSessionManager().listProfiles();
            if (list.length > 0) {
                const { prof } = await inquirer.prompt([{ type: "list", name: "prof", message: "选择会话", choices: list }]);
                profile = prof;
            }
        }
        return { type: "quick-article", url, profile };
    }

    if (action === "gen-stub") return { type: "gen-stub" };
    if (action === "view-sessions") return { type: "view-sessions" };
    if (action === "analyze") return { type: "analyze" };
    if (action === "web") return { type: "web" };
    if (action === "view-config") return { type: "view-config" };
    if (action === "toggle-features") return { type: "toggle-features" };
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
                for (const f of files) { if (f.endsWith(".json")) jsonFiles.push(path.join(dirPath, f)); }
            }
        }
        if (jsonFiles.length === 0) { console.log("⚠️ output 目录中未找到采集结果 JSON 文件。\n"); return; }
        console.log(`\n📂 找到 ${jsonFiles.length} 个采集结果文件：\n`);
        jsonFiles.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
        console.log("");
        const { idx } = await inquirer.prompt([{ type: "input", name: "idx", message: "输入编号查看分析报告（留空取消）：" }]);
        if (!idx || isNaN(Number(idx)) || Number(idx) < 1 || Number(idx) > jsonFiles.length) { console.log("已取消。\n"); return; }
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
