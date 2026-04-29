import inquirer from "inquirer";
import { HarvestConfig } from "../core/models";
import { FileSessionManager } from "../adapters/FileSessionManager";

export type MenuAction =
    | { type: "single"; config: HarvestConfig; profile?: string; saveSession: boolean }
    | { type: "batch" }
    | { type: "login"; profile: string; loginUrl: string; verifyUrl: string }
    | { type: "analyze" }
    | { type: "web" }
    | { type: "exit" };

export async function startMainMenu(): Promise<MenuAction> {
    const { action } = await inquirer.prompt([
        {
            type: "list", name: "action", message: "🌐 WebHarvester 主菜单",
            choices: [
                { name: "1. 单站点快速采集", value: "single" },
                { name: "2. 批量采集", value: "batch" },
                { name: "3. 🔑 登录情报采集与自动登录", value: "login" },
                { name: "4. 📊 分析已有采集结果", value: "analyze" },
                { name: "5. 🌍 启动 Web 可视化面板", value: "web" },
                { name: "0. 退出", value: "exit" }
            ]
        }
    ]);

    if (action === "single") {
        const ans = await inquirer.prompt([
            { type: "input", name: "targetUrl", message: "目标网址：", validate: v => !!v.trim() },
            {
                type: "checkbox", name: "captureItems", message: "采集内容", choices: [
                    { name: "全量网络请求", value: "network", checked: true },
                    { name: "DOM 元素", value: "element", checked: true },
                    { name: "Cookie/存储", value: "storage", checked: true }
                ]
            }
        ]);
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
            } else {
                profile = prof; saveSession = false;
            }
        }
        return {
            type: "single",
            config: {
                targetUrl: ans.targetUrl.trim(),
                networkCapture: { captureAll: true },
                elementSelectors: [
                    "input",
                    "input[type=\"hidden\"]",
                    "form",
                    "button",
                    "textarea",
                    "select"
                ],
                storageTypes: ["localStorage", "sessionStorage", "cookies"]
            },
            profile,
            saveSession
        };
    }

    if (action === "login") {
        const ans = await inquirer.prompt([
            { type: "input", name: "profile", message: "会话保存名称：" },
            { type: "input", name: "loginUrl", message: "登录页面 URL：" },
            { type: "input", name: "verifyUrl", message: "验证登录状态 URL：" }
        ]);
        return { type: "login", ...ans };
    }

    if (action === "analyze") return { type: "analyze" };
    if (action === "web") return { type: "web" };
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
                    if (f.endsWith(".json")) {
                        jsonFiles.push(path.join(dirPath, f));
                    }
                }
            }
        }

        if (jsonFiles.length === 0) {
            console.log("⚠️ output 目录中未找到采集结果 JSON 文件。\n");
            return;
        }

        console.log(`\n📂 找到 ${jsonFiles.length} 个采集结果文件：\n`);
        for (let i = 0; i < jsonFiles.length; i++) {
            console.log(`  ${i + 1}. ${jsonFiles[i]}`);
        }
        console.log("");

        const { idx } = await inquirer.prompt([
            { type: "input", name: "idx", message: "输入编号查看分析报告（留空取消）：" }
        ]);

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
