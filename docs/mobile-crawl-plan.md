# 移动端采集方案

## 当前能力评估

| 维度 | 状态 | 说明 |
|------|------|------|
| UA + Viewport 切换 | ✅ 已完成 | `MOBILE_FINGERPRINTS` 预制 iPhone/Android，可切换 |
| Playwright MCP 设备模拟 | ✅ 已就绪 | `browser_evaluate` 可动态改 UA/viewport |
| H5 页面采集 | ⚠️ 部分可行 | 通过 API 签名的站点不受 UA 影响，CDP/MCP 采集可切换设备 |
| App 抓包 (mitmproxy) | ❌ 未实现 | 需要新增服务 |
| App 逆向 (Frida/Jadx) | ❌ 未实现 | 超出项目范围 |
| ADB/模拟器控制 | ❌ 未实现 | 超出项目范围 |

## 实施路线

### Phase 1 — Web 端移动模拟（已有基础设施，1 天）

**目标**：让现有爬虫可以选择以移动端身份采集。

**改动**：

```
新增:
  src/mcp-client/mobile-engine.ts   ← 移动端 Playwright MCP 包装
  src/cli/ui/mobile-mode.ts         ← 菜单交互

修改:
  RealisticFingerprintProvider.ts    ← 已添加 MOBILE_FINGERPRINTS
  McpBrowserAdapter.ts              ← 支持 launch({ mobile: true })
  main-menu.ts                      ← 新增"移动端模式"选项
```

**移动端 CDP/MCP 采集**：
```typescript
// McpBrowserAdapter 新增 mobile 参数
await adapter.launch(url, session, undefined, undefined, false, false, {
  mobile: true,  // 自动设置 iPhone UA + viewport + 触摸事件
});
```

**移动端 API 采集**（指纹切换）：
```typescript
const fp = new RealisticFingerprintProvider();
const fingerprint = fp.getFingerprint("mobile"); // iPhone / Android
// → 自动切换 UA 头、Accept-Language、Viewport
```

### Phase 2 — mitmproxy 抓包集成（中，2-3 天）

**目标**：通过 mitmproxy 捕获移动端 App 的 API 流量，自动生成爬虫配置。

**新增**：
```
src/services/mitm-capture.ts     ← mitmproxy 进程管理
src/cli/handlers/mitm-capture.ts ← CLI 入口
scripts/mitm-capture.mjs         ← Node.js 子进程（mitmdump 封装）
```

**流程**：
```
1. 启动 mitmdump（内嵌 Python 脚本）
2. 手机/模拟器配置代理到本机
3. 操作 App → mitmproxy 捕获 → 实时输出 HAR
4. web-harvester 解析 HAR → 提取 API 端点 → 生成爬虫配置
```

**依赖**：`pip3 install mitmproxy`，Python 3.8+

### Phase 3 — ADB 模拟器控制（高，1 周+）

**目标**：通过 ADB 控制 Android 模拟器/真机，自动化 App 操作。

**组件**：
```
src/services/adb-engine.ts       ← ADB 命令封装
scripts/adb-screen-tap.mjs       ← 图像识别点击脚本
```

**依赖**：ADB + Android 模拟器（雷电/夜神）

---

## 推荐优先级

| 优先级 | 项目 | 时间 | 理由 |
|--------|------|------|------|
| P1 | **移动端 UA 切换集成到菜单** | 半天 | 已有基础设施，只需 UI 联通 |
| P2 | mitmproxy 抓包集成 | 2-3 天 | App 分析起点，但需要 Python 环境 |
| P3 | ADB 模拟器控制 | 1 周+ | 资源消耗大，维护成本高 |

## 结论

**当前项目最值得投入的是 Phase 1（移动端 UA 切换）**，因为 Playwright MCP 已经支持设备模拟，只需要将现有的 `MOBILE_FINGERPRINTS` 预设值通过菜单暴露给用户选择。Phase 2（mitmproxy）需要 Python 环境，与当前 Node.js 技术栈耦合度高，建议独立为子项目。Phase 3（ADB）维护成本超过收益，不推荐在当前阶段投入。
