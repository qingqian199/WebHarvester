# 数据分类

采集结果自动分为**核心信息（core）**和**次要信息（secondary）**两层。

## 分类规则

### Core（核心信息）
用于爬虫前置分析，包含：
- **apiEndpoints** — 筛选后的业务 API（排除静态资源 `.js/.css/.png` 和埋点上报域名）
- **authTokens** — 从 localStorage/sessionStorage/Cookies 中提取的鉴权令牌
- **deviceFingerprint** — 设备标识 Cookie（`buvid`/`a1`/`b_lsid`）和 localStorage 键名列表
- **antiCrawlDefenses** — 反爬检测结果

### Secondary（次要信息）
用于页面内容存档，包含：
- **allCapturedRequests** — 完整的网络请求记录
- **domStructure** — 页面 DOM 元素快照
- **performanceMetrics** — Performance API 指标
- **hiddenFields** — CSRF Token、验证码等隐藏字段

## 输出格式

```json
{
  "classification": {
    "version": "1.0",
    "classifiedAt": "2026-04-30T12:00:00.000Z",
    "originalTraceId": "abc123"
  },
  "core": { ... },
  "secondary": { ... }
}
```
