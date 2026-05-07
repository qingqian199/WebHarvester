/**
 * 格式转换脚本。
 * 用法:
 *   ts-node scripts/convert-format.ts <combinedFile> --format xlsx|md|all
 */
import path from "path";
import { FormatService } from "../src/services/FormatService";

const [, , combinedFile] = process.argv;
const formatFlag = process.argv.find((a) => a.startsWith("--format=")) || process.argv[3] || "--format=all";
const format = formatFlag.replace("--format=", "");

if (!combinedFile) {
  console.error("用法: ts-node scripts/convert-format.ts <combinedFile> [--format=xlsx|md|all]");
  console.error("示例: ts-node scripts/convert-format.ts output/zhihu/combined-xxx.json --format=xlsx");
  process.exit(1);
}

const fullPath = path.resolve(combinedFile);
const svc = new FormatService();

(async () => {
  try {
    if (format === "xlsx" || format === "all") {
      const out = await svc.convertToExcel(fullPath);
      console.log(`✅ Excel: ${out}`);
    }
    if (format === "md" || format === "all") {
      const out = await svc.convertToMarkdown(fullPath);
      console.log(`✅ Markdown: ${out}`);
    }
  } catch (e) {
    console.error("❌ 转换失败:", (e as Error).message);
    process.exit(1);
  }
})();
