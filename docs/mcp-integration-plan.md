# web-harvester 接入 Playwright MCP 实施方案

## 当前架构

```
用户请求 → 调度器
  ├─ 特化爬虫（8个）→ DS/WBI/x-zse-96 签名 → API 直连（165ms）
  └─ 通用浏览器 → cdp-harvest.mjs（自己维护，问题多）
       ├─ CDP 连接不稳定（Chrome 版本兼容）
       ├─ SPA 页面文本为空
       └─ 5 个散文件，结构混乱
```

## 目标架构

```
用户请求 → 调度器
  ├─ 特化爬虫（8个）→ 不变
  └─ 通用浏览器 → Playwright MCP 客户端
       ├─ 微软维护，零代码维护成本
       ├─ accessibility tree（非 innerText，SPA 友好）
       ├─ 20+ 工具（导航/点击/截图/表单/Cookie）
       └─ 输出统一
```

---

## 实施步骤

### Step 1：安装依赖（5 分钟）

```bash
npm install @modelcontextprotocol/sdk
npx playwright install chromium
```

`@modelcontextprotocol/sdk` 已存在于 package.json（OpenCode 项目），但 web-harvester 需要确认是否已安装。如未安装则添加。

### Step 2：新建 MCP 客户端模块（src/mcp-client/，半天）

新建 `src/mcp-client/` 目录，包含：

| 文件 | 职责 |
|------|------|
| `client.ts` | MCP 客户端连接管理（启动/停止 Playwright MCP 子进程） |
| `tools.ts` | 将 MCP 工具封装为 web-harvester 可调用的函数 |
| `browser-engine.ts` | 实现 `IBrowserAdapter` 接口，对接 Playwright MCP |
| `index.ts` | 导出统一入口 |

#### client.ts 核心逻辑

```typescript
import { spawn, ChildProcess } from "child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

let mcpProcess: ChildProcess | null = null;
let mcpClient: Client | null = null;

export async function startBrowserMcp(): Promise<Client> {
  if (mcpClient) return mcpClient;

  mcpProcess = spawn("npx", ["@playwright/mcp@latest"], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, PLAYWRIGHT_CHROMIUM_HEADLESS: "1" },
  });

  const transport = new StdioClientTransport({
    stdin: mcpProcess.stdin,
    stdout: mcpProcess.stdout,
  });

  mcpClient = new Client({ name: "webharvester-mcp-client", version: "1.0" });
  await mcpClient.connect(transport);
  return mcpClient;
}

export async function stopBrowserMcp(): Promise<void> {
  if (mcpClient) { await mcpClient.close(); mcpClient = null; }
  if (mcpProcess) { mcpProcess.kill(); mcpProcess = null; }
}
```

#### browser-engine.ts 核心逻辑

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { IBrowserAdapter } from "../../core/ports/IBrowserAdapter";

export class McpBrowserAdapter implements IBrowserAdapter {
  constructor(private client: Client) {}

  async launch(url: string): Promise<void> {
    await this.client.request(
      { method: "tools/call", params: {
        name: "playwright_navigate",
        arguments: { url }
      }},
      {},
    );
  }

  async executeScript<T>(script: string): Promise<T> {
    const result = await this.client.request(
      { method: "tools/call", params: {
        name: "playwright_evaluate",
        arguments: { script }
      }},
      {},
    );
    return JSON.parse((result as any).content[0].text);
  }

  async screenshot(): Promise<Buffer> {
    const result = await this.client.request(
      { method: "tools/call", params: {
        name: "playwright_screenshot",
        arguments: {}
      }},
      {},
    );
    return Buffer.from((result as any).content[0].data, "base64");
  }

  // 其他方法类似...
}
```

### Step 3：替换 `cdp-harvest.mjs`（半天）

创建一个新的通用浏览器采集器 `src/services/McpHarvestService.ts`，替代现有的 `cdp-harvest.mjs`：

```typescript
export async function harvestWithMcp(url: string): Promise<HarvestResult> {
  const client = await startBrowserMcp();

  // 1. 导航
  await client.request({ method: "tools/call", params: {
    name: "playwright_navigate", arguments: { url }
  }}, {});

  // 2. 获取页面快照（accessibility tree，比 innerText 更完整）
  const snapshot = await client.request({ method: "tools/call", params: {
    name: "playwright_snapshot", arguments: {}
  }}, {});

  // 3. 提取所有文本内容
  const text = await client.request({ method: "tools/call", params: {
    name: "playwright_evaluate", arguments: {
      script: "document.body.innerText"
    }
  }}, {});

  // 4. 截图
  const screenshot = await client.request({ method: "tools/call", params: {
    name: "playwright_screenshot", arguments: {}
  }}, {});

  // 5. 获取 Cookie（用于后续 API 调用）
  const cookies = await client.request({ method: "tools/call", params: {
    name: "playwright_get_cookies", arguments: {}
  }}, {});

  // 保存结果到 output/{site}-{timestamp}/
  return saveResult(url, text, snapshot, screenshot, cookies);
}
```

### Step 4：替换现有的 CDP 采集入口（1 小时）

修改 `src/cli/handlers/single-harvest.ts`，将 CDP 子进程回退路径改为 MCP 客户端调用：

```typescript
// 之前：execFile("node", ["scripts/cdp-harvest.mjs", ...])
// 之后：
const { McpBrowserAdapter } = await import("../../mcp-client/browser-engine");
const adapter = new McpBrowserAdapter(client);
const svc = new HarvesterService(deps.logger, adapter, storage, httpEngine, deps.dispatcher);
await svc.harvest(action.config, ...);
```

### Step 5：可选 — 暴露为 MCP 服务器（让外部 AI 也能用）

如果希望其他 MCP 客户端也能操控 web-harvester 的浏览器，可以在现有 `src/mcp/tools.ts` 中注册浏览器工具：

```typescript
// 在 registerMcpTools 中添加
server.registerTool({
  name: "browser_navigate",
  description: "打开浏览器访问指定 URL",
  inputSchema: { type: "object", properties: { url: { type: "string" } } },
  handler: async (args) => { /* 调用 Playwright MCP */ },
});
```

---

## 工作量估算

| 步骤 | 工作量 | 产出 |
|------|--------|------|
| Step 1 安装依赖 | 5 分钟 | — |
| Step 2 `src/mcp-client/` | 半天 | MCP 客户端 + BrowserAdapter |
| Step 3 `McpHarvestService` | 半天 | 通用浏览器采集服务 |
| Step 4 替换入口 | 1 小时 | CDP 脚本退役 |
| Step 5 MCP 服务器暴露（可选） | 1 小时 | 双向 MCP 能力 |

**总计：约 2 天**

---

## 项目文件变更清单

```
新增:
  src/mcp-client/client.ts          ← MCP 连接管理
  src/mcp-client/tools.ts            ← Playwright 工具封装
  src/mcp-client/browser-engine.ts   ← IBrowserAdapter 实现
  src/mcp-client/index.ts            ← 统一导出

修改:
  src/cli/handlers/single-harvest.ts ← CDP → MCP 替换
  package.json                       ← 确认 @modelcontextprotocol/sdk 依赖

删除:
  scripts/cdp-harvest.mjs            ← 被 MCP 替代
  scripts/download-media.mjs         ← 被 MCP 截图/评估替代
```

---

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| `@modelcontextprotocol/sdk` 版本兼容 | 锁定与 OpenCode 一致的版本 `1.27.1` |
| MCP 进程启动延迟（首次需下载浏览器） | `npx playwright install chromium` 在安装时运行 |
| accessibility tree 对某些 SPA 不完整 | 回退到 `playwright_evaluate` 取 innerText |
| MCP 进程崩溃 | `startBrowserMcp()` 增加自动重启逻辑 |
