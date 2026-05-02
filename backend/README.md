# WebHarvester Backend Service

独立后端服务，将浏览器令牌管理、代理池、限流等能力从 WebHarvester 主进程分离，

通过 REST API 供所有特化爬虫调用。

## 架构

```
backend/
├── src/
│   ├── index.ts                  ← 服务入口，启动 Express HTTP 服务器
│   ├── config.ts                 ← 后端服务配置（环境变量 / 默认值）
│   ├── services/
│   │   ├── ZpTokenService.ts     ← BOSS 直聘 __zp_stoken__ 令牌服务
│   │   ├── ProxyPoolService.ts   ← 代理池管理（预留）
│   │   └── RateLimitService.ts   ← 限流令牌分发（预留）
│   └── routes/
│       ├── boss.ts               ← BOSS 直聘 API（token/health）
│       ├── xiaohongshu.ts        ← 小红书签名注入 API（预留 501）
│       ├── tiktok.ts             ← TikTok 签名 API（预留 501）
│       ├── proxy.ts              ← 代理池 API（预留 501）
│       └── ratelimit.ts          ← 限流 API（预留 501）
├── tests/
│   ├── zptoken-service.test.ts
│   └── routes/
│       └── boss.test.ts
├── package.json
└── tsconfig.json
```

## 快速开始

```bash
cd backend
npm install
npm start
```

服务默认监听 `http://0.0.0.0:3001`。

## API 文档

### BOSS 直聘

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/boss/health` | 令牌服务健康检查 |
| GET | `/api/boss/token` | 获取当前 `__zp_stoken__`、`traceid`、`cookies` |
| POST | `/api/boss/token/refresh` | 强制刷新令牌 |

**`GET /api/boss/health`**

```json
{
  "status": "ready",
  "ready": true,
  "hasStoken": true,
  "hasTraceid": true
}
```

**`GET /api/boss/token`**

```json
{
  "stoken": "xxxxx",
  "traceid": "xxxxx",
  "cookies": {
    "__zp_stoken__": "xxxxx",
    "__zp_sseed__": "12345"
  }
}
```

### 全局

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 全局健康检查 |

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `BACKEND_PORT` | `3001` | 监听端口 |
| `BACKEND_HOST` | `0.0.0.0` | 监听地址 |
| `STOKEN_REFRESH_MS` | `1500000` (25min) | `__zp_stoken__` 刷新间隔 |
| `BOOTSTRAP_URL` | `https://www.zhipin.com/web/geek/jobs` | 令牌引导页面 |
| `HEADLESS` | `true` | 是否无头模式启动 Playwright |

## 测试

```bash
cd backend
npm test
```

## WebHarvester 集成

在 WebHarvester 的 `config.json` 中配置：

```json
{
  "features": {
    "enableBackendService": true
  },
  "backendService": {
    "baseUrl": "http://localhost:3001",
    "timeout": 30000
  }
}
```

- `enableBackendService: false`（默认）→ BossZhipinCrawler 使用本地 ZpTokenManager（现有行为）
- `enableBackendService: true` → BossSecurityMiddleware 通过 HTTP 调用后端服务获取令牌
