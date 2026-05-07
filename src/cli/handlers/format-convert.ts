import fs from "fs";
import path from "path";
import inquirer from "inquirer";
import { FormatService } from "../../services/FormatService";

export async function handleFormatConvert(): Promise<void> {
  const jsonFiles: string[] = [];
  const outputDir = path.resolve("output");
  if (!fs.existsSync(outputDir)) {
    console.log("\n⚠️ output/ 目录不存在。\n");
    return;
  }
  for (const entry of fs.readdirSync(outputDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      for (const f of fs.readdirSync(path.join(outputDir, entry.name))) {
        if (f.endsWith(".json") && !f.endsWith("-crawl.json") && !f.endsWith("-api.csv")) {
          jsonFiles.push(path.join(outputDir, entry.name, f));
        }
      }
    }
  }
  if (jsonFiles.length === 0) {
    console.log("\n⚠️ output/ 目录中未找到可转换的 JSON 文件。\n");
    return;
  }
  const { harvestPath } = await inquirer.prompt([{ type: "list", name: "harvestPath", message: "选择转换文件：", choices: jsonFiles }]);
  const { fmt } = await inquirer.prompt([{ type: "list", name: "fmt", message: "选择目标格式：", choices: [
    { name: "Excel (.xlsx)", value: "xlsx" },
    { name: "Markdown (.md)", value: "md" },
    { name: "全部", value: "all" },
  ]}]);
  console.log("");
  const svc = new FormatService();
  try {
    if (fmt === "xlsx" || fmt === "all") {
      const out = await svc.convertToExcel(harvestPath);
      console.log(`✅ Excel: ${out}`);
    }
    if (fmt === "md" || fmt === "all") {
      const out = await svc.convertToMarkdown(harvestPath);
      console.log(`✅ Markdown: ${out}`);
    }
  } catch (e) {
    console.log(`❌ 转换失败: ${(e as Error).message}`);
  }
}
