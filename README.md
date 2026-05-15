# WebHarvester

**站点特化数据采集框架** — 签名逆向 · 自适应降级 · AI 驱动采集

---

## 核心能力

| 能力 | 说明 |
|---|---|
| **签名直连** | 逆向各平台 API 签名算法（B站 WBI、小红书 X-S、知乎 x-zse-96），HTTP 直连获取结构化数据，无需浏览器渲染 |
| **自适应降级** | 三层降级链：API 签名直连 → 签名重试 → Playwright 浏览器提取，逐级兜底 |
| **反爬识别** | 增强全量采集自动识别 WBI 签名、Gaia 设备指纹、CSRF Token、验证码 SDK 等反爬机制并生成报告 |
| **内容单元** | 站点特化的模块化采集单元（视频信息/评论/搜索/论文详情等），通过 `collectUnits` 编排 |
| **AI 驱动** | MCP Server (Model Context Protocol) 支持自然语言驱动采集：`搜索B站机器学习视频并获取评论` |
| **可视化面板** | Web 仪表盘，支持登录态管理、任务提交、结果查看 |

---

## 支持的站点

| 站点 | 采集单元 | 签名方式 | 状态 |
|---|---|---|---|
| **B站** | 视频信息、搜索、UP主视频、评论、子回复 | WBI (`w_rid`+`wts`) | ✅ 已验证通过 |
| **小红书** | 用户信息、笔记、搜索、评论、收藏 | X-S (XXTEA+MD5) | ✅ 签名可用 |
| **知乎** | 用户信息、文章、搜索、热搜、评论 | x-zse-96 | ✅ 签名可用 |
| **百度学术** | 论文搜索、论文详情 | Playwright 浏览器策略链 | ✅ 含 CAPTCHA 检测 |
| **抖音** | 视频评论 | 浏览器内签名 | ✅ |
| **TikTok** | 视频信息、搜索、用户 | 页面数据提取 | ✅ |

---

## 架构

```
┌─ 采集入口 ──────────────────────────────────────┐
│  CLI / Web UI / MCP / HTTP API                   │
└──────────────────────┬──────────────────────────┘
                       │ collectUnits()
┌──────────────────────▼──────────────────────────┐
│  dispatchUnit → unitHandlers.get(unit)           │
│  ┌─ bilibili: bili_video_info / bili_search ...  │
│  ├─ xiaohongshu: user_info / note_detail ...     │
│  ├─ zhihu: zhihu_article / zhihu_comments ...    │
│  └─ baidu_scholar: scholar_search / detail ...   │
└──────────────────────┬──────────────────────────┘
                       │ fetchApi / fetchPageData
┌──────────────────────▼──────────────────────────┐
│  数据源层                                         │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────┐  │
│  │ HTTP 直连    │  │ Playwright   │  │ 浏览器    │  │
│  │ (签名逆向)    │  │ (降级兜底)    │  │ CDP 复用  │  │
│  └─────────────┘  └──────────────┘  └──────────┘  │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│  输出层                                           │
│  HAR + JSON + CSV + Markdown 报告 + 反爬分析      │
└─────────────────────────────────────────────────┘
```

### 关键技术决策

| 决策 | 选择 | 理由 |
|---|---|---|
| 爬虫框架 | **自研** `dispatchUnit` 策略映射 | 站点特化逆向不适合通用框架；每个站点的签名算法、降级逻辑、字段映射都不同 |
| API 优先 | **HTTP 直连 » 浏览器** | 签名直连 200-500ms，浏览器启动 2-5s；生产环境可用性差距极大 |
| 存储 | **文件系统** | 无运维依赖；按 `output/{domain}/{traceId}.json` 组织 |
| 队列 | **PQueueTaskQueue**（内存） | 单机够用，无分布式需求 |

---

## 快速开始

```bash
npm install
npx playwright install chromium
npm start
```

打开 `http://localhost:3000` 进入 Web 控制台。

### 配置登录态

```bash
# 扫码登录（以 B站 为例）
npm start
# 进入 Web 面板 → 登录管理 → 扫码
```

### 采集示例

```bash
# CLI 模式：搜索 B站 视频
node dist/cli/index.js
# 选择 增强全量采集 → 输入 B站视频URL

# 或通过 API
curl -X POST http://localhost:3000/api/collect-units \
  -H "Content-Type: application/json" \
  -d '{"site":"bilibili","units":["bili_video_info"],"params":{"url":"https://www.bilibili.com/video/BV1xx4y1k7zQ"}}'
```

---

## MCP Server（AI 驱动）

MCP Server 允许 Claude 等 AI 通过自然语言驱动采集。

**启动：**
```bash
node dist/mcp/cli.js
```

**可用工具：**

| 工具 | 描述 |
|---|---|
| `harvest_url` | 增强全量采集单个 URL |
| `collect_units` | 运行指定站点内容单元 |
| `search_and_collect` | 搜索 + 采集一站式 |
| `list_sessions` | 列出已保存的登录态 |
| `get_results` | 列出采集结果文件 |

---

## 项目结构

```
src/
├── adapters/
│   └── crawlers/           # 站点爬虫实现
│       ├── BaseCrawler.ts        # 基础类(中间件/SSR提取/策略)
│       ├── BilibiliCrawler.ts    # B站(WBI签名/评论/子回复)
│       ├── XhsCrawler.ts         # 小红书(X-S签名/笔记/评论)
│       ├── ZhihuCrawler.ts       # 知乎(x-zse-96签名/文章)
│       ├── BaiduScholarCrawler.ts # 百度学术(5层策略链)
│       ├── DouyinCrawler.ts      # 抖音(浏览器内签名)
│       └── TikTokCrawler.ts      # TikTok(页面数据提取)
├── core/
│   ├── ports/              # 端口接口
│   ├── models/             # 数据模型
│   └── services/           # 核心服务(HarvesterService等)
├── utils/
│   ├── crypto/             # 签名算法实现
│   │   ├── bilibili-signer.ts   # WBI(w_rid+wts)
│   │   ├── xhs-signer.ts        # X-S(XXTEA+MD5)
│   │   └── zhihu-signer.ts      # x-zse-96
│   └── exporter/           # 导出(XLSX/CSV等)
├── web/                    # Web 控制台
│   ├── WebServer.ts        # HTTP服务+CORS+JWT(240行)
│   └── routes/             # 路由模块(5个)
│       ├── auth.ts         # 登录认证
│       ├── harvest.ts      # 采集任务
│       ├── session.ts      # 会话管理
│       ├── data.ts         # 数据查询/导出
│       └── system.ts       # 系统状态
├── mcp/                    # MCP Server
│   ├── protocol.ts         # JSON-RPC 2.0 over stdio
│   ├── server.ts           # 服务启动
│   ├── tools.ts            # 工具定义(5个)
│   └── cli.ts              # CLI入口
└── cli/                    # 命令行菜单
```

---

## 测试

```bash
npm test        # 614 tests, 72 suites
npm run lint    # ESLint 0 errors
```

---

## 版本

v1.1.0 — 站点特化采集框架
