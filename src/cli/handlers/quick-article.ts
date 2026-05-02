import fs from "fs/promises";
import path from "path";
import { CliDeps, CliAction } from "../types";
import { ArticleCaptureService } from "../../services/ArticleCaptureService";
import { FileSessionManager } from "../../adapters/FileSessionManager";

export async function handleQuickArticle(deps: CliDeps, action: CliAction): Promise<void> {
  const service = new ArticleCaptureService(deps.logger, new FileSessionManager(), action.profile);
  try {
    const result = await service.capture(action.url || "");
    const slug = result.title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, "_").slice(0, 60) || "article";
    const outDir = path.resolve("output", "quick-article");
    const outFile = path.join(outDir, `${slug}.json`);
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(outFile, JSON.stringify(result, null, 2), "utf-8");

    console.log("\n═══════════════════════════════════");
    console.log(`  标题: ${result.title}`);
    console.log(`  作者: ${result.author.name}`);
    console.log(`  正文长度: ${result.content.length} 字符`);
    console.log(`  采集时间: ${result.capturedAt}`);
    console.log(`  已保存: ${outFile}`);
    console.log("═══════════════════════════════════\n");
    console.log("正文预览:\n");
    console.log(result.content.slice(0, 500) + (result.content.length > 500 ? "\n..." : ""));
  } catch (e) {
    deps.logger.error("文章采集失败", { err: (e as Error).message });
    console.log("❌ 文章采集失败:", (e as Error).message);
  }
}
