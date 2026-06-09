# 爬取工作流：从无到有

**前提**：目标站点没有任何特化爬虫，你需要从零发现它的数据接口。

---

## 第一阶段：侦察

目标：了解目标站点的页面结构、API 端点、反爬机制。

### 操作

```
主菜单 → 增强全量采集 → 连接已有Chrome → 输入目标URL
```

### 产出

```
output/cdp-harvest-{timestamp}/
├── result.json          ← 页面标题、文本、Meta
├── content.txt          ← 页面纯文本
├── screenshot.png       ← 页面截图
└── *-session.json       ← Cookie/Storage
```

### 你从中可以知道

| 信息 | 位置 |
|------|------|
| 页面标题 & 描述 | `result.json` → `title` / `meta.description` |
| 页面结构（SSR / SPA） | 文本量 + 截图判断 |
| 页面文本内容 | `content.txt`（SPA 可能很短） |
| 当前登录状态 | `*-session.json` → `cookies` 数量 |

### 判断结论

- **文本量大（>5000 字）+ SSR 数据存在** → 可直接用 HTTP 引擎提取
- **文本量小 + SPA 特征** → 数据通过 API 加载，需进入第二阶段

---

## 第二阶段：API 发现

目标：找到页面加载时调用的数据 API。

### 方法一：CDP 增强捕获（推荐）

```
主菜单 → 增强全量采集 → 开启"增强模式"
```
CDP 会自动捕获所有网络请求，包括 XHR/Fetch 调用。

产出：`output/cdp-harvest-{timestamp}/` 内的 `*-har.json`（HAR 格式）。

### 方法二：手动浏览器 DevTools

1. 打开 Chrome DevTools (F12)
2. 切换到 Network 面板
3. 刷新页面
4. 过滤 `XHR` / `Fetch` / `JS`
5. 寻找返回 JSON 数据的请求

### 从 HAR 中识别 API

用以下特征过滤：

| 特征 | 示例 |
|------|------|
| 响应格式 JSON | `Content-Type: application/json` |
| 路径含 API 关键词 | `/api/`, `/v1/`, `/graphql` |
| 返回结构化数据 | 帖子列表、用户信息、评论 |
| 路径含资源 ID | `/post/75691313`, `/video/abc123` |

### 你从中可以知道

| 信息 | 重要性 |
|------|--------|
| API 端点 URL | 必须 |
| HTTP 方法（GET/POST） | 必须 |
| 请求参数 | 必须 |
| 请求头（Cookie、签名等） | 必须 |
| 响应数据格式 | 必须 |
| 是否需要签名 | 关键 |
| 是否需要登录 | 关键 |

---

## 第三阶段：API 分析

目标：理解 API 的认证和签名机制。

### 检查是否需登录

```
直调 API（不带 Cookie）：
  HTTP 200 + 数据正常 → 无需登录
  HTTP 401/403          → 需登录
  JSON code ≠ 0         → 需登录或签名
```

如需登录，导入 Chrome 会话：
```bash
node scripts/import-chrome-cookies.mjs
```

### 检查是否需要签名

```
直调 API（带 Cookie）：
  返回数据正常 → 无需额外签名
  返回 403 / code=异常 → 需要签名
```

### 常见签名类型

| 特征 | 签名类型 | 示例站点 |
|------|---------|---------|
| Header 中有 `X-s`、`X-t` | 自定义 MD5 | 小红书 |
| Header 中有 `x-zse-96` | 自定义 HMAC | 知乎 |
| URL 参数中有 `w_rid`、`wts` | WBI 签名 | B站 |
| Header 中有 `DS` | 自定义 MD5 | 米游社 |
| Header 中有 `X-Bogus`、`a_bogus` | 浏览器运行时签名 | TikTok、抖音 |
| URL/Header 中有时间戳+随机数 | 自定义签名 | BOSS直聘 |

### 签名逆向策略

| 签名类型 | 逆向难度 | 策略 |
|---------|---------|------|
| 自定义 MD5（X-s、DS） | 中 | 从 Webpack 打包的 JS 中提取算法，或使用浏览器运行时签名服务 |
| HMAC（x-zse-96） | 中 | 从 JS 中提取密钥，或使用 VaultKit 签名服务 |
| WBI（w_rid） | 低 | 密钥通过公开 API 获取，算法已知 |
| 浏览器运行时（a_bogus） | 高 | 必须使用浏览器引擎采集，无法纯 API 直连 |

---

## 第四阶段：实施采集

根据分析结果选择最合适的采集方式：

### 选项 A：HTTP 直连（无签名，无需登录）

```
最简路径。直接用 fetch() 请求 API。
```

```javascript
const res = await fetch("https://api.example.com/posts");
const data = await res.json();
```

**适用**：无签名、无登录、无反爬的开放 API。

### 选项 B：签名 API（有签名，可能需要登录）

```
实现签名算法 → 构造请求 → 采集数据。
```

```javascript
const headers = buildSignatureHeaders(params);
headers["Cookie"] = sessionCookie;
const res = await fetch(url, { headers });
const data = await res.json();
```

**适用**：大多数 Web 站点。需参考现有爬虫的签名实现。

### 选项 C：浏览器引擎（SPA / 浏览器签名）

```
使用 Playwright 或 CDP 连接 Chrome，让浏览器渲染页面。
```

```
主菜单 → 增强全量采集 → 连接已有Chrome → 输入URL
```

**适用**：
- 重度 SPA（React/Vue 单页应用）
- 需要浏览器运行时签名（TikTok a_bogus）
- 验证码/反爬挑战
- JS 动态渲染的内容

---

## 第五阶段：沉淀为特化爬虫

当 API 接口稳定后，可注册为新爬虫。

### 最小实现

```typescript
// src/adapters/crawlers/NewSiteCrawler.ts
export class NewSiteCrawler extends BaseCrawler {
  readonly name = "newsite";
  readonly domain = "example.com";

  matches(url: string): boolean {
    return url.includes("example.com");
  }

  async fetch(url: string, session?: CrawlerSession): Promise<PageData> {
    // 实现签名 + 请求 + 返回
  }
}
```

### 注册到调度器

```typescript
// src/index.ts createCrawlerDispatcher()
if (appCfg.crawlers?.newsite === "enabled")
  d.register(new NewSiteCrawler(globalProxyProvider));
```

### 添加内容单元（可选）

如需结构化字段（如标题、正文、评论），在爬虫中注册 `unitHandlers` 并定义 `ContentUnitDef`。

---

## 决策速查

```
                   ┌─────────────┐
                   │  输入 URL   │
                   └──────┬──────┘
                          │
              ┌───────────┴───────────┐
              │                       │
        有特化爬虫                无特化爬虫
              │                       │
        直接采集                增强全量CDP
              │                       │
        结构化数据              分析 HAR 找 API
              │                       │
              │            ┌──────────┴──────────┐
              │            │                     │
              │       无签名/HTTP          需签名/SPA
              │            │                     │
              │       HTTP 直连          浏览器引擎/CDP
              │            │                     │
              └──────┬────┘                     │
                     │                          │
                 结构化数据                  HAR/截图
```

## 六、URL 爬取失败排查指南

### 真实案例：知乎专栏文章 404

```
URL: https://zhuanlan.zhihu.com/p/2045909180624678920

排查过程:
  1. HTTP GET → 403（WAF 拦截）
  2. 加浏览器头重试 → 403
  3. 直调 API /api/v4/articles/{id} → 404 "Not Found"
  4. 检查 ID 格式: 19 位数字，知乎文章 ID 通常 7-12 位
  5. 结论: ❌ 该文章 ID 不存在

纠正: 提供正确的知乎专栏文章 URL（从浏览器地址栏直接复制）
```

### 通用排查流程

```
URL 爬取失败
  │
  ├─ HTTP 403/503 ────── WAF/CDN 拦截
  │   ├─ 加浏览器 User-Agent → 重试
  │   └─ 还是 403 → 使用 CDP 直连 Chrome
  │
  ├─ HTTP 404 ────────── 资源不存在
  │   ├─ 检查 URL 格式是否正确
  │   ├─ 检查资源 ID 是否符合平台规范
  │   └─ 确认文章未删除/未设置私密
  │
  ├─ HTTP 429 ────────── 频率限制
  │   └─ 降低请求频率，等待后重试
  │
  ├─ 返回空/超时 ─────── SPA 未渲染
  │   ├─ 增加等待时间
  │   └─ 使用 CDP 浏览器采集
  │
  └─ JSON code ≠ 0 ──── 业务异常
      ├─ 需登录 → 导入 Cookie
      ├─ 需签名 → 实现签名算法
      └─ 权限不足 → 检查账号状态
```

## 七、完整示例：发现并采集一个未知站点

```
1. 增强全量 → https://example.com
   → 发现页面是 SPA，文本几乎为空
   → HAR 中发现 /api/v1/posts 返回 JSON

2. 不带 Cookie 直调 /api/v1/posts
   → 返回 403
   → 带 Cookie 直调 → 返回 JSON 数据 ✓

3. 分析响应结构:
   { code: 0, data: { list: [{ id, title, content, ... }] } }

4. 实现采集:
   获取 Cookie → fetch("/api/v1/posts", { Cookie }) → 解析 JSON

5.（可选）提取签名算法:
   发现 Header 中有 X-Sign
   → 从页面 JS 中搜索 "X-Sign" 找到算法
   → 实现签名函数
   → 无需 Cookie 也能采集
```
