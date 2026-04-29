# ADR-0002: crawl-ops 模块 — 反爬标注与桩代码生成

**状态**: 已采纳  
**日期**: 2026-04-29  
**决策者**: @qingqian  

## 背景

采集任务完成后，用户拿到的是原始 HAR 和分析报告。要从"已采集数据"到"可运行的爬虫代码"之间仍有较大差距：需要人工识别反爬类型、提取签名密钥、编写验证逻辑。这个过程的重复性高，适合自动化。

## 决策

在 `src/utils/crawl-ops/` 下新增两个独立组件：

### AntiCrawlTagger（反爬标注器）
扫描 `HarvestResult.networkRequests`，通过 URL 模式匹配已知反爬类型（WBI 签名、Gaia 设备注册/公钥获取/加密上传、验证码等），输出结构化 `anti-crawl-items.json`。

### StubGenerator（桩代码生成器）
从采集结果（localStorage + HAR 参数）中提取 WBI 签名的 `img_key` / `sub_key`，生成可运行的签名函数（Python/JS），附带验证测试用例。

### 设计原则
- 两个组件**无状态、无副作用**（纯函数风格），输入 → 输出
- 不修改现有采集流水线的核心逻辑，通过 `FileStorageAdapter.save()` 末尾的可选钩子集成
- 独立 CLI 命令 `npm run gen-stub` 支持单独调用

### 集成方式
```
HarvesterService.harvest()
  → FileStorageAdapter.save()
    → [钩子] AntiCrawlTagger.tag() → anti-crawl.json
    → [钩子] StubGenerator.generateWbiStub() → wbi-stub.py
```

由 `FeatureFlags.enableAntiCrawlTagging` 和 `FeatureFlags.enableStubGeneration` 控制开关。

## 备选方案

1. **作为独立 CLI 工具发布**：功能独立但增加分发复杂度，与采集结果的数据耦合仍需文件 I/O
2. **直接嵌入 HarvesterService**：耦合度过高，违反单一职责

## 后果

### 正面
- 爬虫开发者的逆向→编码链路缩短，可直接拿到半成品代码
- 两个组件可独立测试（纯函数）
- 通过 Feature Flags 控制渐进式发布

### 负面
- 反爬规则列表需持续维护（目前仅 B 站规则）
- 生成的桩代码需要开发者验证（算法可能随站点更新而变化）

## 相关文件

- `src/utils/crawl-ops/anti-crawl-tagger.ts`
- `src/utils/crawl-ops/stub-generator.ts`
- `src/utils/crawl-ops/index.ts`
- `src/core/features.ts`
- `src/adapters/FileStorageAdapter.ts`
- `src/cli/gen-stub.ts`
