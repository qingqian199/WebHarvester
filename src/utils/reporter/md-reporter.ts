import { HarvestResult } from "../../core/models";
import { filterApiRequests, filterHiddenFields } from "../../core/rules";
import { MAX_DISPLAY_ITEMS, MAX_CAPTION_LENGTH } from "../../core/constants/GlobalConstant";

export function generateMarkdownReport(result: HarvestResult): string {
  const { traceId, targetUrl, networkRequests, elements, startedAt, finishedAt } = result;
  const dur = finishedAt - startedAt;
  const apiList = filterApiRequests(networkRequests);
  const hiddenList = filterHiddenFields(elements);
  const authLocal = result.analysis?.authInfo?.localStorage ?? {};
  const authSession = result.analysis?.authInfo?.sessionStorage ?? {};

  let md = "# Web站点资产采集报告\n\n";
  md += `> 任务ID：${traceId}\n`;
  md += `> 目标网址：${targetUrl}\n`;
  md += `> 采集耗时：${dur} ms\n`;
  md += `> 采集时间：${new Date(startedAt).toLocaleString()}\n\n`;

  md += "## 一、数据概览\n\n";
  md += `- 全量网络请求：${networkRequests.length} 条\n`;
  md += `- 业务接口：${apiList.length} 条\n`;
  md += `- 页面元素：${elements.length} 个\n`;
  md += `- 隐藏安全字段：${hiddenList.length} 个\n\n`;

  md += "## 二、核心业务接口\n\n";
  if (apiList.length === 0) md += "无有效业务接口\n\n";
  else {
    md += `| 方法 | 状态码 | 链接 |
|------|--------|------|
`;
    for (const item of apiList.slice(0, MAX_DISPLAY_ITEMS)) {
      const url = item.url.length > MAX_CAPTION_LENGTH ? item.url.slice(0, MAX_CAPTION_LENGTH) + "..." : item.url;
      md += `| ${item.method} | ${item.statusCode} | ${url} |
`;
    }
    if (apiList.length > MAX_DISPLAY_ITEMS) md += `\n> 仅展示前${MAX_DISPLAY_ITEMS}条，完整请查看CSV文件\n`;
  }

  md += "\n## 三、授权令牌信息\n\n";
  const MASK_MIN_LEN = 10;
  const MASK_PREFIX = 6;
  const MASK_SUFFIX = -4;
  const mask = (s: string) => s.length < MASK_MIN_LEN ? s : `${s.slice(0, MASK_PREFIX)}****${s.slice(MASK_SUFFIX)}`;
  if (Object.keys(authLocal).length || Object.keys(authSession).length) {
    for (const [k, v] of Object.entries(authLocal)) md += `- LocalStorage【${k}】：${mask(v)}\n`;
    for (const [k, v] of Object.entries(authSession)) md += `- SessionStorage【${k}】：${mask(v)}\n`;
  } else md += "未检测到授权令牌、密钥数据\n";

  md += "\n## 四、隐藏安全字段\n\n";
  if (hiddenList.length) {
    for (const f of hiddenList) {
      const name = f.attributes.name || "unnamed";
      md += `- ${name}：${f.attributes.value ?? ""}\n`;
    }
  } else md += "未检测到隐藏安全字段\n";

  md += "\n---\n自动生成 by WebHarvester";
  return md;
}
