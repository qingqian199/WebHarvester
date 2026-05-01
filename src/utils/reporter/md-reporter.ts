import { HarvestResult } from "../../core/models";
import { MAX_DISPLAY_ITEMS, MAX_CAPTION_LENGTH } from "../../core/constants/GlobalConstant";
import { DataClassifier } from "../../core/services/DataClassifier";

export function generateMarkdownReport(result: HarvestResult): string {
  const classifier = new DataClassifier();
  const classified = classifier.classify(result);
  const { core, secondary } = classified;
  const { traceId, targetUrl, startedAt, finishedAt } = result;
  const dur = finishedAt - startedAt;

  let md = "# Web站点资产采集报告\n\n";
  md += `> 任务ID：${traceId}\n`;
  md += `> 目标网址：${targetUrl}\n`;
  md += `> 采集耗时：${dur} ms\n`;
  md += `> 采集时间：${new Date(startedAt).toLocaleString()}\n\n`;

  // ── 核心信息 ──
  md += "## 🔑 核心信息\n\n";

  md += "### API 端点\n\n";
  const apiList = core.apiEndpoints;
  if (apiList.length === 0) {
    md += "无业务 API\n\n";
  } else {
    md += `| 方法 | 状态码 | 链接 |
|------|--------|------|
`;
    for (const item of apiList.slice(0, MAX_DISPLAY_ITEMS)) {
      const url = item.url.length > MAX_CAPTION_LENGTH ? item.url.slice(0, MAX_CAPTION_LENGTH) + "..." : item.url;
      md += `| ${item.method} | ${item.statusCode} | ${url} |
`;
    }
    if (apiList.length > MAX_DISPLAY_ITEMS) {
      md += `\n> 仅展示前${MAX_DISPLAY_ITEMS}条，完整请查看JSON文件\n`;
    }
  }

  md += "\n### 鉴权令牌\n\n";
  const tokens = core.authTokens;
  if (Object.keys(tokens).length === 0) {
    md += "未检测到\n\n";
  } else {
    const mask = (s: string) => s.length < 12 ? s : `${s.slice(0, 6)}****${s.slice(-4)}`;
    for (const [k, v] of Object.entries(tokens)) {
      md += `- \`${k}\`：${mask(v)}\n`;
    }
  }

  md += "\n### 反爬检测\n\n";
  if (core.antiCrawlDefenses.length === 0) {
    md += "未检测到反爬机制\n\n";
  } else {
    for (const item of core.antiCrawlDefenses) {
      const level = item.severity === "high" ? "🔴" : item.severity === "medium" ? "🟡" : "🟢";
      md += `- ${level} [${item.category}] ${item.requestKey.slice(0, 80)}...\n`;
    }
  }

  // ── 次要信息 ──
  md += "\n## 📄 次要信息\n\n";
  md += `- 全量网络请求：${secondary.allCapturedRequests.length} 条\n`;
  md += `- DOM 元素：${secondary.domStructure.length} 个\n`;
  md += `- 隐藏字段：${secondary.hiddenFields.length} 个\n`;
  if (secondary.performanceMetrics) {
    md += `- 页面加载：${secondary.performanceMetrics.duration}ms / 协议 ${secondary.performanceMetrics.protocol}\n`;
  }

  md += "\n### 隐藏字段\n\n";
  if (secondary.hiddenFields.length === 0) {
    md += "未检测到\n";
  } else {
    for (const f of secondary.hiddenFields) {
      md += `- ${f.name}：${f.value ?? ""}\n`;
    }
  }

  md += "\n---\n> 数据分类 v1 | 自动生成 by WebHarvester\n";
  return md;
}
