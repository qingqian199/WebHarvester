/**
 * 格式转换服务 — 将采集结果 JSON 转换为 Excel / Markdown。
 * 支持三种输入格式：
 * - combined-*.json: UnitResult 数组
 * - harvest-*.json: HarvestResult
 * - classified-*.json: ClassifiedHarvestResult
 */
import fs from "fs/promises";
import path from "path";

export class FormatService {
  async convertToExcel(filePath: string): Promise<string> {
    const { exportResultsToXlsx } = await import("../utils/exporter/xlsx-exporter");
    const raw = await fs.readFile(filePath, "utf-8");
    const data = JSON.parse(raw);
    const outDir = path.dirname(filePath);
    const baseName = path.basename(filePath, ".json");
    const outFile = path.join(outDir, `${baseName}.xlsx`);
    const buf = exportResultsToXlsx(Array.isArray(data) ? data : [data]);
    await fs.writeFile(outFile, buf);
    return outFile;
  }

  async convertToMarkdown(filePath: string): Promise<string> {
    const raw = await fs.readFile(filePath, "utf-8");
    const data = JSON.parse(raw);
    const outDir = path.dirname(filePath);
    const baseName = path.basename(filePath, ".json");
    const outFile = path.join(outDir, `${baseName}.md`);

    let md = "";
    if (Array.isArray(data)) {
      md = this.unitResultsToMd(data);
    } else if (data.networkRequests) {
      md = this.harvestToMd(data);
    }
    await fs.writeFile(outFile, md, "utf-8");
    return outFile;
  }

  private unitResultsToMd(results: any[]): string {
    const lines: string[] = ["# 采集结果报告\n"];
    for (const r of results) {
      const icon = r.status === "success" ? "✅" : r.status === "partial" ? "⚠️" : "❌";
      lines.push(`## ${icon} ${r.unit}`);
      lines.push(`- 状态: ${r.status}`);
      lines.push(`- 方法: ${r.method}`);
      lines.push(`- 耗时: ${r.responseTime}ms`);
      if (r.error) lines.push(`- 错误: ${r.error}`);
      if (r.data) lines.push(`- 数据: ${JSON.stringify(r.data).slice(0, 200)}`);
      lines.push("");
    }
    return lines.join("\n");
  }

  private harvestToMd(harvest: any): string {
    const lines: string[] = [
      "# 全量采集报告\n",
      `- 目标: ${harvest.targetUrl || "N/A"}`,
      `- 请求数: ${harvest.networkRequests?.length || 0}`,
      `- 耗时: ${(harvest.finishedAt || 0) - (harvest.startedAt || 0)}ms`,
      "",
    ];
    return lines.join("\n");
  }
}
