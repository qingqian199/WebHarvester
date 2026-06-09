# WebHarvester API 文档

## 基础信息

- **基础路径**：`http://localhost:3000`
- **认证方式**：JWT Bearer Token（除 `/health`、`/api/auth/login` 和静态文件外，所有 `/api/` 路径都需要认证）
- **获取 Token**：`POST /api/auth/login`
- **Token 有效期**：24 小时
- **请求格式**：`application/json`
- **响应格式**：`application/json`

### 通用响应格式

```json
// 成功
{ "code": 0, "data": { ... } }
// 失败
{ "code": -1, "msg": "错误描述" }
// 认证失败
{ "code": -1, "msg": "未授权，请先登录" }
```

### 认证方式

Token 可通过两种方式传递：
1. **Authorization Header**：`Bearer <token>`
2. **URL Query 参数**：`?token=<token>`

---

## 一、系统状态

### `GET /health` / `GET /api/health`

系统健康检查（无需认证）。

**响应示例**：
```json
{
  "status": "ok",
  "uptime": 3600,
  "version": "1.2.0",
  "platform": "win32",
  "memoryUsage": { "rss": 150000000, "heapUsed": 80000000, "heapTotal": 120000000 },
  "profileCount": 3,
  "taskQueueLength": 0,
  "activeBrowsers": 0
}
```

### `GET /api/crawlers`

获取爬虫配置状态。

```json
// 响应
{ "code": 0, "data": { "xiaohongshu": "enabled", "zhihu": "enabled", "bilibili": "enabled" } }
```

### `GET /api/features`

获取功能开关列表。

```json
{ "code": 0, "data": { "enableChromeService": { "enabled": true, "implemented": true }, "enableParallelTask": { "enabled": false, "implemented": false } } }
```

---

## 二、认证

### `POST /api/auth/login`

Web 面板登录。

**请求体**：
```json
{ "username": "admin", "password": "admin" }
```

**响应**：
```json
{ "code": 0, "data": { "token": "eyJhbG...", "expiresIn": "24h" } }
```

**速率限制**：同一 IP 5 次失败后锁定 15 分钟。

**错误码**：
| 状态码 | 说明 |
|--------|------|
| 401 | 用户名或密码错误 |
| 429 | 登录尝试过于频繁 |

---

## 三、会话管理

### `POST /api/login`

通过浏览器打开登录页，等待用户完成登录后保存会话。

**请求体**：
```json
{ "profile": "bilibili-main", "loginUrl": "https://www.bilibili.com/login", "verifyUrl": "https://api.bilibili.com/x/web-interface/nav" }
```

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `profile` | string | ✅ | 会话保存名称 |
| `loginUrl` | string | ✅ | 登录页面 URL |
| `verifyUrl` | string | ✅ | 验证登录态是否成功的 API 地址 |

### `POST /api/login/qrcode`

扫码登录。启动浏览器打开登录页供用户扫码。

**请求体**：
```json
{ "profile": "bilibili-qr", "loginUrl": "https://www.bilibili.com/login" }
```

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `profile` | string | ✅ | 会话保存名称 |
| `loginUrl` | string | ✅ | 登录页面 URL |
| `autoSave` | boolean | ❌ | 是否自动等待并保存（默认 false） |

`autoSave=true` 时，服务端会自动等待 5 分钟内的登录态并保存。  
`autoSave=false` 时，返回 sessionId，后续通过 confirm 端点手动保存。

### `POST /api/login/qrcode/confirm`

确认扫码登录并抓取会话。

**请求体**：
```json
{ "profile": "bilibili-qr", "save": true, "sessionData": { ... } }
```

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `profile` | string | ✅ | 会话名称 |
| `save` | boolean | ❌ | 直接保存（配合已有 sessionData） |
| `sessionData` | object | ❌ | 前端已获取的会话数据 |

### `POST /api/login/qrcode/cleanup`

清理扫码登录会话（关闭浏览器、释放资源）。

**请求体**：无需参数

### `GET /api/profiles`

获取所有会话 Profile 名称列表。

```json
{ "code": 0, "data": ["bilibili-main", "zhihu-main"] }
```

### `GET /api/sessions`

获取所有会话详情。

```json
{
  "code": 0,
  "data": [
    { "name": "bilibili-main", "status": "valid", "cookies": 12, "createdAt": 1700000000000 },
    { "name": "zhihu-main", "status": "expired", "cookies": 8, "createdAt": 1690000000000 }
  ]
}
```

`status` 字段：`valid`（14 天内更新）/ `expired`（超过 14 天）

### `DELETE /api/sessions/:name`

删除指定会话。

**响应**：`{ "code": 0, "msg": "已删除会话 bilibili-main" }`

### `POST /api/sessions/validate`

验证会话是否有效。

**请求体**：`{ "profile": "bilibili-main" }`

**响应**：
```json
{ "code": 0, "data": { "valid": true, "profile": "bilibili-main", "cookieCount": 12, "ageHours": 72 } }
```

### `POST /api/sessions/sync-from-browser`

从 Chrome CDP 同步 Cookie 到本地会话文件。

```json
{ "code": 0, "data": { "synced": ["bilibili", "zhihu"], "count": 2 } }
```

---

## 四、采集操作

### `POST /api/run`

对单个 URL 执行浏览器采集。

**请求体**：
```json
{ "url": "https://example.com", "profile": "optional-profile", "enhanced": true }
```

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `url` | string | ✅ | 目标网址（会校验内网地址） |
| `profile` | string | ❌ | 登录态会话名称 |
| `enhanced` | boolean | ❌ | 是否启用增强全量模式（捕获所有网络请求） |

### `POST /api/collect-units`

对指定站点运行内容单元采集。

**请求体**：
```json
{
  "site": "bilibili",
  "units": ["bili_video_info", "bili_video_comments"],
  "params": { "url": "https://www.bilibili.com/video/BV1xx411c7mD" },
  "sessionName": "bilibili-main",
  "authMode": "logged_in"
}
```

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `site` | string | ✅ | 站点标识：`xiaohongshu` / `zhihu` / `bilibili` / `tiktok` |
| `units` | string[] | ✅ | 采集单元列表 |
| `params` | object | ❌ | 采集参数（url / keyword / user_id 等） |
| `sessionName` | string | ❌ | 会话名称 |
| `authMode` | string | ❌ | `logged_in` / `guest` |

**支持的单位单元**：

| 站点 | 可用单元 |
|------|---------|
| `xiaohongshu` | `search_notes`, `note_detail`, `user_notes`, `user_info` |
| `zhihu` | `zhihu_hot_search`, `zhihu_search`, `zhihu_article`, `zhihu_comments` |
| `bilibili` | `bili_video_info`, `bili_video_comments`, `bili_search`, `bili_user_info` |
| `tiktok` | `tt_feed`, `tt_user_info`, `tt_video_detail` |

### `POST /api/task`

提交异步采集任务（需先开启任务队列）。

**请求体**：同 `collect-units`

**响应**：
```json
{ "code": 0, "data": { "taskId": "task_1700000000_abc123", "status": { "pending": 1, "running": 0, "completed": 0, "failed": 0 } } }
```

### `GET /api/task/:taskId`

查询异步任务状态。

```json
{
  "code": 0,
  "data": {
    "taskId": "task_1700000000_abc123",
    "completed": true,
    "result": { ... },
    "error": null,
    "queueStatus": { "pending": 0, "running": 0, "completed": 1, "failed": 0 }
  }
}
```

### `GET /api/tasks/stream`

SSE（Server-Sent Events）事件流，实时推送任务队列变化。

**事件类型**：
- `queue` — 队列状态变化
- `task` — 任务事件（started / completed / failed）

### `GET /api/batch`

执行批量采集（从 `batch.json` 读取任务配置）。

---

## 五、数据分析

### `POST /api/analyze`

对已保存的采集结果文件进行分析，返回 HTML 报告。

**请求体**：`{ "filePath": "output/site-1700000000/data.json" }`

**响应**：`Content-Type: text/html` 格式的报告页面

### `POST /api/quick-article`

快速采集单个文章内容。

**请求体**：`{ "url": "https://example.com/article" }`

**响应**：
```json
{ "code": 0, "data": { "title": "...", "content": "...", "author": "...", "publishDate": "..." } }
```

### `POST /api/format`

格式化采集结果，生成可读文本。

**请求体 1（按单元格式化）**：
```json
{ "units": [{ "unit": "bili_video_info", "data": { ... } }] }
```

**请求体 2（按结果集格式化）**：
```json
{ "results": [{ "unit": "...", "data": { ... }, "status": "success" }] }
```

### `POST /api/export-xlsx`

将采集结果导出为 Excel 文件。

**请求体**：
```json
{ "results": [{ "unit": "...", "data": { ... }, "status": "success" }] }
```

**响应**：`Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`（二进制文件下载）

---

## 六、数据查询

### `GET /api/results`

列出所有采集结果文件。

```json
{
  "code": 0,
  "data": [
    { "filename": "bilibili-1700000000/data.json", "url": "https://...", "timestamp": "2025-01-01T00:00:00.000Z", "size": 10240 }
  ]
}
```

### `GET /api/results/:filename`

获取单个采集结果文件内容。路径穿越已防护。

### `GET /api/content-units?site=bilibili`

获取指定站点支持的内容单元列表。

```json
{
  "code": 0,
  "data": [
    { "id": "bili_video_info", "label": "视频基本信息", "description": "标题、播放量、点赞数等" }
  ]
}
```

支持站点：`xiaohongshu` / `zhihu` / `bilibili` / `tiktok` / `boss_zhipin`

### `POST /api/history`

查询 SQLite 数据库中的历史采集记录。

**请求体**：
```json
{
  "domain": "bilibili.com",
  "taskName": "video_crawl",
  "timeStart": 1700000000000,
  "timeEnd": 1700100000000,
  "limit": 20,
  "offset": 0
}
```

---

## 七、浏览器服务

### `GET /api/browser/health`

检查 ChromeService / CDP 连接健康状态。

```json
{ "code": 0, "data": { "health": { "port": 9222, "uptime": 3600000 }, "status": "ChromeService running" } }
```

---

## 八、MCP 桥接

### `POST /api/mcp`

通过 HTTP 桥接调用 MCP 工具。采用 JSON-RPC 2.0 协议。

**请求体**：
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": { "name": "harvest_url", "arguments": { "url": "https://example.com" } }
}
```

**可用工具**：

| 工具名 | 说明 |
|--------|------|
| `harvest_url` | 对单个 URL 执行增强全量采集 |
| `collect_units` | 对指定站点运行内容单元采集 |
| `search_and_collect` | 搜索并采集指定站点内容 |
| `list_sessions` | 列出所有已保存的登录态 |
| `get_results` | 列出采集结果文件 |
| `validate_session` | 验证指定登录态是否有效 |
| `check_login_status` | 验证指定站点的登录态是否有效 |
| `update_session` | 通过 Cookie 字符串更新站点登录态 |
| `trigger_wbi_sync` | 强制刷新 B站 WBI 签名密钥 |
| `search_papers` | 搜索百度学术论文 |
| `run_crawl_task` | 手动触发采集任务 |
| `sync_sessions_from_browser` | 从 CDP 浏览器同步 Cookie 到本地会话 |
| `check_browser_health` | 检查 ChromeService/CDP 连接健康状态 |
| `wait_for_user_action_complete` | 告知爬虫用户已完成手动操作，继续采集 |
| `report_diagnostics` | 对指定 traceId 的采集任务执行全量诊断 |
| `auto_repair` | 对指定 traceId 执行诊断 → 自动修复 → 重试闭环 |

---

## 九、静态文件

| URL | 文件 | MIME |
|-----|------|------|
| `/` | `static/index.html` | `text/html` |
| `/index.html` | `static/index.html` | `text/html` |
| `/style.css` | `static/style.css` | `text/css` |
| `/api.js` | `static/api.js` | `application/javascript` |

---

## 错误码参考

| 状态码 | 错误码 | 说明 |
|--------|--------|------|
| 400 | — | 请求参数错误（缺少必需字段） |
| 401 | — | 未授权（Token 无效或未提供） |
| 404 | — | 资源不存在 |
| 408 | — | 扫码登录超时 |
| 429 | E012 | 登录尝试过于频繁 |
| 500 | E001 | 服务器内部错误 |
| 503 | — | 任务队列未启用 |

---

## 认证流程图

```
Client                     WebServer
  │                           │
  │  POST /api/auth/login     │
  │  {username, password}     │
  │──────────────────────────>│
  │  {code:0, data:{token}}   │
  │<──────────────────────────│
  │                           │
  │  GET /api/sessions        │
  │  Authorization: Bearer JWT │
  │──────────────────────────>│
  │  验证 JWT → 处理请求      │
  │<──────────────────────────│
  │                           │
  │  GET /health              │
  │  (no auth)                │
  │──────────────────────────>│
  │  {status:"ok",...}        │
  │<──────────────────────────│
```

---

## 扫码登录流程

```
Client                   WebServer                      Browser
  │                         │                              │
  │ POST /api/login/qrcode  │                              │
  │────────────────────────>│                              │
  │                         │ 启动 Playwright              │
  │                         │─────────────────────────────>│
  │                         │ 打开 loginUrl                │
  │                         │<─────────────────────────────│
  │ {code:0, data:{...}}    │                              │
  │<────────────────────────│                              │
  │                         │                              │
  │ 用户扫码完成登录        │                              │
  │                         │                              │
  │ POST /api/login/qrcode/ │                              │
  │ confirm                 │                              │
  │────────────────────────>│                              │
  │                         │ 检测 Cookie → 保存会话       │
  │                         │<─────────────────────────────│
  │ {code:0, msg, userInfo} │                              │
  │<────────────────────────│                              │
```

---

## 数据目录结构

```
output/
  bilibili-1700000000/
    data.json              ← 采集结果数据
    report.json            ← 分析报告
    network.har.json       ← 网络请求 HAR
    screenshot.png         ← 页面截图
    cookies.json           ← Cookie 快照
  zhihu-1700000001/
    data.json
    ...

sessions/
  bilibili-main/
    main.json              ← 会话数据 (cookies + storage)
  zhihu-main/
    main.json
```

---

## 快速入门

```bash
# 1. 获取令牌
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}'

# 2. 列出会话
curl -H "Authorization: Bearer <token>" \
  http://localhost:3000/api/sessions

# 3. 采集 B 站视频数据
curl -X POST http://localhost:3000/api/collect-units \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"site":"bilibili","units":["bili_video_info","bili_video_comments"],"params":{"url":"https://www.bilibili.com/video/BV1xx411c7mD"}}'

# 4. 健康检查（无需认证）
curl http://localhost:3000/api/health
```
