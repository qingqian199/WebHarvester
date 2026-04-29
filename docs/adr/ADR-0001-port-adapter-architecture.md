# ADR-0001: 端口-适配器架构

**状态**: 已采纳  
**日期**: 2026-04-29  
**决策者**: @qingqian  

## 背景

WebHarvester 需要支持多种浏览器引擎（Playwright / Puppeteer）、多种存储后端（本地文件 / S3）和多种日志输出方式。初期如果直接依赖具体实现，后续替换成本会很高。

## 决策

采用**端口-适配器模式（Port-Adapter / Hexagonal Architecture）**：

- 核心层（`core/ports/`）定义抽象接口：`IBrowserAdapter`、`IStorageAdapter`、`ILogger`、`ISessionManager` 等
- 适配器层（`adapters/`）提供具体实现，实现上述端口接口
- 业务逻辑（`HarvesterService`）只依赖端口接口，不依赖具体适配器

```
HarvesterService → IBrowserAdapter (port)
                 → IStorageAdapter  (port)
                 → ILogger          (port)
                        ↓
                PlaywrightAdapter   (adapter)
                FileStorageAdapter  (adapter)
                ConsoleLogger       (adapter)
```

## 备选方案

1. **直接依赖 Playwright API**：开发速度最快，但切换引擎需重写所有业务代码
2. **简单工厂模式**：通过工厂隐藏创建细节，但工厂返回的具体类仍绑定接口

## 后果

### 正面
- 浏览器引擎可替换：Playwright → Puppeteer 只需写一个新适配器
- 核心业务逻辑可单元测试：端口接口可 mock
- 关注点分离清晰

### 负面
- 初期需维护接口与实现的映射关系
- 简单场景下接口定义的抽象层增加了间接性

## 相关文件

- `src/core/ports/IBrowserAdapter.ts`
- `src/core/ports/IStorageAdapter.ts`
- `src/core/ports/ILogger.ts`
- `src/core/ports/ISessionManager.ts`
- `src/adapters/PlaywrightAdapter.ts`
- `src/adapters/FileStorageAdapter.ts`
- `src/core/services/HarvesterService.ts`
