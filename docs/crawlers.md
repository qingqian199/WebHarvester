# 特化爬虫

特化爬虫直接构造带签名的 HTTP 请求访问目标站点，速度比浏览器引擎快一个数量级，适用于已知签名算法的站点。

## 架构

```
HarvesterService.harvest()
  → CrawlerDispatcher.fetch(url)         ← 优先走特化爬虫
    ├─ ISiteCrawler.matches(url) → true  → crawler.fetch() → 返回 PageData
    └─ 无匹配 → 回退通用引擎（StrategyOrchestrator → browser / http）
```

爬虫需实现 `ISiteCrawler` 端口接口，通过 `CrawlerDispatcher` 注册。

## 已支持站点

| 站点 | 爬虫 | 签名状态 | config.json |
|------|------|----------|-------------|
| xiaohongshu.com | `XhsCrawler` | ⚡ 第一阶段（基础框架） | `"xiaohongshu": "enabled"` |

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

1. 在 `src/core/ports/ISiteCrawler.ts` 确认接口定义：

```typescript
export interface ISiteCrawler {
  readonly name: string;
  readonly domain: string;
  matches(url: string): boolean;
  fetch(url: string, session?: CrawlerSession): Promise<PageData>;
}
```

2. 在 `src/adapters/crawlers/` 下新建爬虫文件，实现 `ISiteCrawler`。

3. 在 `CrawlerDispatcher` 的初始化位置注册爬虫（当前在 `index.ts` `bootstrap()` 中注册）。

4. 在 `config.json` 中添加配置开关。
