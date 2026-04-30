# 特化爬虫

特化爬虫直接构造带签名的 HTTP 请求访问目标站点，速度比浏览器引擎快一个数量级，适用于已知签名算法的站点。

## 架构

```
HarvesterService.harvest()
  → CrawlerDispatcher.fetch(url)           ← 优先走特化爬虫
    ├─ ISiteCrawler.matches(url) → true   → crawler.fetch() → 返回 PageData
    └─ 无匹配 → 回退通用引擎（StrategyOrchestrator → browser / http）
```

爬虫需实现 `ISiteCrawler` 端口接口，通过 `CrawlerDispatcher` 注册。

## 已支持站点

| 站点 | 爬虫 | 签名状态 | config.json |
|------|------|----------|-------------|
| xiaohongshu.com | `XhsCrawler` | ✅ Phase 2（XXTEA + MD5） | `"xiaohongshu": "enabled"` |

## 小红书 XhsCrawler

### Phase 2 签名验证结果

| # | 端点 | code | 耗时 | 结果 |
|:-|------|:----:|:----:|:----:|
| 1 | `/v2/user/me` | 0 | 79ms | ✅ 用户信息完整返回 |
| 2 | `/v1/search/recommend` | 1000 | 105ms | ✅ 搜索建议返回 |
| 3 | `/v1/search/notes` (POST) | 300011 | 70ms | ⏳ 风控触发（非签名问题） |
| 4 | 其他 GET 端点 | -1 | ~50ms | ❌ 参数格式待确认 |

### 已验证有效的 API

| 端点 | Code | 说明 |
|------|:----:|------|
| `GET /api/sns/web/v2/user/me` | 0 | 当前登录用户信息 |
| `GET /api/sns/web/v1/search/recommend` | 1000 | 搜索关键词推荐（sug_items） |

### 已验证签名有效但需正确参数的 API

| 端点 | Code | 说明 |
|------|:----:|------|
| `GET /api/sns/web/v1/search/notes` (POST) | 300011 | 搜索笔记，触发风控 |
| `GET /api/sns/web/v1/user_posted` | -1 | 用户帖子列表，参数格式待确认 |
| `GET /api/sns/web/v1/board/user` | -1 | 收藏列表，参数格式待确认 |
| `GET /api/sns/web/v1/user/otherinfo` | -1 | 其他用户信息，参数格式待确认 |

### 注意事项

- 需要有效登录态（`web_session` Cookie），通过扫码登录获取
- POST 请求可能触发风控（code 300011），需配合完整请求头
- 部分 API 路径和参数格式需要从 Web 前端网络请求中抓包确认
- `feed`、`user/following` 等端点的 API 路径可能与预期不符（返回 404）

## 签名算法说明

```
generateXsHeader(path, data, cookies)
  → X-t = Date.now()
  → mnsv2(path, data, a1, xt)
    → md5(path + data) → XXTEA 加密 → 自定义 Base64 → x3
  → X-s = "XYS_" + customBase64(JSON.stringify({x0, x1, x2, x3, x4}))
```

## 配置

在 `config.json` 中启用或禁用：

```json
{
  "crawlers": {
    "xiaohongshu": "enabled",
    "zhihu": "disabled"
  }
}
```

## 如何贡献新的特化爬虫

1. 在 `src/core/ports/ISiteCrawler.ts` 确认接口定义
2. 在 `src/adapters/crawlers/` 下新建爬虫文件，实现 `ISiteCrawler`
3. 在 `index.ts` 的 `createCrawlerDispatcher` 中注册爬虫
4. 在 `config.json` 中添加配置开关
