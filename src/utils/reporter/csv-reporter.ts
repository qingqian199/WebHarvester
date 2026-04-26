import { NetworkRequest } from "../../core/models";
import { filterApiRequests } from "../../core/rules";

export function generateApiCsv(requests: NetworkRequest[]): string {
  const list = filterApiRequests(requests);
  const header = ["请求方法", "状态码", "请求URL", "请求头数量", "请求体大小", "响应体大小"];
  const lines: string[] = [header.join(",")];

  const escape = (s: string) => s.replace(/"/g, '""');
  const getSize = (o: unknown) => {
    if (!o) return 0;
    try { return JSON.stringify(o).length; } catch { return 0; }
  };

  for (const item of list) {
    const row = [
      item.method,
      item.statusCode,
      `"${escape(item.url)}"`,
      Object.keys(item.requestHeaders || {}).length,
      getSize(item.requestBody),
      getSize(item.responseBody)
    ];
    lines.push(row.join(","));
  }
  return lines.join("\n");
}