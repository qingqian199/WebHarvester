import { HarvestResult } from "../core/models";
import { filterApiRequests, filterHiddenFields } from "../core/rules";

export interface AnalysisSummary {
    targetUrl: string;
    traceId: string;
    startedAt: number;
    finishedAt: number;
    durationMs: number;
    totalRequests: number;
    apiRequests: Array<{
        method: string;
        url: string;
        status: number;
    }>;
    hiddenElements: Array<{
        selector: string;
        tagName: string;
        name: string;
        value: string;
    }>;
    storageKeys: {
        localStorage: string[];
        sessionStorage: string[];
        cookies: string[];
    };
    authTokens: Array<{ name: string; value: string }>;
}

export class ResultAnalyzer {
    static summarize(result: HarvestResult): AnalysisSummary {
        const { targetUrl, traceId, startedAt, finishedAt, networkRequests, elements, storage, analysis } = result;
        const duration = finishedAt - startedAt;
        const apiList = analysis?.apiRequests || filterApiRequests(networkRequests);
        const hiddenList = analysis?.hiddenFields || filterHiddenFields(elements);

        const localStorageKeys = Object.keys(storage.localStorage);
        const sessionStorageKeys = Object.keys(storage.sessionStorage);
        const cookiesNames = storage.cookies.map(c => c.name);

        const authTokens: AnalysisSummary['authTokens'] = [];
        const sensitiveKeywords = ['token', 'access_token', 'refresh_token', 'auth', 'session', 'jwt', 'secret', 'key'];
        for (const [key, value] of Object.entries(storage.localStorage)) {
            if (sensitiveKeywords.some(k => key.toLowerCase().includes(k))) {
                authTokens.push({ name: `localStorage.${key}`, value: value.slice(0, 30) + '...' });
            }
        }
        for (const [key, value] of Object.entries(storage.sessionStorage)) {
            if (sensitiveKeywords.some(k => key.toLowerCase().includes(k))) {
                authTokens.push({ name: `sessionStorage.${key}`, value: value.slice(0, 30) + '...' });
            }
        }

        return {
            targetUrl,
            traceId,
            startedAt,
            finishedAt,
            durationMs: duration,
            totalRequests: networkRequests.length,
            apiRequests: apiList.map(r => ({
                method: r.method,
                url: r.url,
                status: r.statusCode,
            })),
            hiddenElements: hiddenList.map(el => ({
                selector: el.selector,
                tagName: el.tagName,
                name: el.attributes.name || '',
                value: el.attributes.value || '',
            })),
            storageKeys: {
                localStorage: localStorageKeys,
                sessionStorage: sessionStorageKeys,
                cookies: cookiesNames,
            },
            authTokens,
        };
    }

    static generateHtmlReport(summary: AnalysisSummary, originalResult?: HarvestResult): string {
        const durationSec = (summary.durationMs / 1000).toFixed(2);
        const started = new Date(summary.startedAt).toLocaleString();

        let html = `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <title>采集分析报告 - ${summary.targetUrl}</title>
  <style>
    body{font-family: -apple-system, sans-serif;margin:20px;background:#f5f7fa}
    .card{background:#fff;border-radius:8px;padding:16px;margin-bottom:16px;box-shadow:0 2px 8px rgba(0,0,0,0.1)}
    h2{color:#2563eb;margin-top:0}
    table{border-collapse:collapse;width:100%}
    th,td{border:1px solid #ddd;padding:8px;text-align:left}
    th{background:#f0f0f0}
    .badge{padding:2px 8px;border-radius:4px;font-size:12px}
    .badge-get{background:#22c55e;color:#fff}
    .badge-post{background:#f59e0b;color:#fff}
    .token{background:#f0f0f0;padding:2px 6px;border-radius:4px;font-family:monospace}
  </style>
</head>
<body>
  <h1>📊 站点资产分析报告</h1>
  <div class="card">
    <h2>基本信息</h2>
    <p>🎯 目标：<a href="${summary.targetUrl}" target="_blank">${summary.targetUrl}</a></p>
    <p>🕒 采集时间：${started}　⏱️ 耗时：${durationSec}秒</p>
    <p>📡 总请求数：${summary.totalRequests}　🔌 API 接口数：${summary.apiRequests.length}</p>
  </div>`;

        html += `<div class="card"><h2>核心 API 请求</h2>`;
        if (summary.apiRequests.length === 0) {
            html += `<p>未检测到 API 请求</p>`;
        } else {
            html += `<table><tr><th>方法</th><th>URL</th><th>状态</th></tr>`;
            for (const api of summary.apiRequests) {
                const badgeClass = api.method === 'POST' ? 'badge-post' : 'badge-get';
                html += `<tr>
          <td><span class="badge ${badgeClass}">${api.method}</span></td>
          <td style="word-break:break-all">${api.url}</td>
          <td>${api.status}</td>
        </tr>`;
            }
            html += `</table>`;
        }
        html += `</div>`;

        html += `<div class="card"><h2>隐藏/安全字段</h2>`;
        if (summary.hiddenElements.length === 0) {
            html += `<p>未发现隐藏字段</p>`;
        } else {
            html += `<table><tr><th>选择器</th><th>标签</th><th>名称</th><th>值</th></tr>`;
            for (const el of summary.hiddenElements) {
                html += `<tr>
          <td>${el.selector}</td>
          <td>${el.tagName}</td>
          <td>${el.name}</td>
          <td>${el.value}</td>
        </tr>`;
            }
            html += `</table>`;
        }
        html += `</div>`;

        html += `<div class="card"><h2>存储快照</h2>
    <h3>Cookies (${summary.storageKeys.cookies.length})</h3>
    <p>${summary.storageKeys.cookies.join(', ') || '无'}</p>
    <h3>localStorage 键值</h3>
    <p>${summary.storageKeys.localStorage.join(', ') || '无'}</p>
    <h3>sessionStorage 键值</h3>
    <p>${summary.storageKeys.sessionStorage.join(', ') || '无'}</p>
    </div>`;

        html += `<div class="card"><h2>检测到的认证信息</h2>`;
        if (summary.authTokens.length === 0) {
            html += `<p>未提取到明显的令牌</p>`;
        } else {
            for (const t of summary.authTokens) {
                html += `<p><span class="token">${t.name}</span> = ${t.value}</p>`;
            }
        }
        html += `</div>`;

        html += `<footer style="text-align:center;margin-top:20px;color:#666">WebHarvester v1.0.1 自动生成</footer></body></html>`;
        return html;
    }
}