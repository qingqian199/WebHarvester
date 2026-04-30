# 故障排查指南

## 安装与启动

### 缺少 Chromium

**现象**：运行 `npm start` 后立即崩溃，报 `chromium.launch: Executable doesn't exist` 或类似错误。

**原因**：Playwright 需要下载 Chromium 浏览器内核，`npm install` 不会自动下载。

**解决**：

```bash
npx playwright install chromium
```

如果下载缓慢或失败，可指定镜像：

```bash
# 中国大陆用户
PLAYWRIGHT_DOWNLOAD_HOST=https://npmmirror.com/mirrors/playwright npx playwright install chromium
```

### Node.js 版本不匹配

**现象**：启动时报 `SyntaxError: Unexpected token '?'` 或类似语法错误。

**原因**：项目要求 Node.js >= 18.x（ES2020 + 可选链操作符）。

**解决**：

```bash
node --version   # 确认版本
# 如果低于 18，使用 nvm 或 n 升级：
nvm install 20
nvm use 20
```

### ESLint 报错

**现象**：`npm run lint` 报 `Oops! Something went wrong`。

**原因**：项目使用 ESLint 9 flat config 格式（`eslint.config.js`）。如果看到 `Couldn't find an eslint.config.* file`，说明配置文件缺失。

**解决**：确认项目根目录存在 `eslint.config.js`。如果是旧版 `.eslintrc.json` 残留，删除后重新安装：

```bash
rm .eslintrc.json          # 删除旧格式（如存在）
npm install                # 确保依赖安装完整
```

---

## 采集失败

### ERR_TIMEOUT / 页面加载超时

**现象**：日志中出现 `Timeout 30000ms exceeded` 或 `page.goto: Timeout`。

**原因**：目标页面网络请求过多，`networkidle` 等待条件在超时内无法满足（典型如 B 站首页、视频页）。

**解决**：

1. **调整超时配置**：修改 `config.json`
   ```json
   {
     "actionTimeoutMs": 30000,
     "taskTimeoutMs": 120000
   }
   ```

2. **改用 `domcontentloaded`**（已在扫码登录和会话验证中默认使用）。如果使用 CLI 直接采集发现超时，可在批量化时增加任务间隔。

3. **网络较慢时**：减少并发数
   ```json
   {
     "concurrency": 1
   }
   ```

### 页面空白 / SPA 未加载完成

**现象**：采集结果中 `elements` 为空，或 `storage` 无数据。

**原因**：SPA（Vue/React）页面在 `domcontentloaded` 时组件尚未渲染完成，需要额外等待。

**解决**：

在 `config.json` 中增加等待时间或切换等待策略：

```json
{
  "actionTimeoutMs": 30000,
  "browserMask": {
    "minDelayMs": 1000,
    "maxDelayMs": 2000
  }
}
```

如果使用自定义采集，可在 `HarvestConfig.actions` 中添加等待：

```json
{
  "actions": [{ "type": "wait", "waitTime": 3000 }]
}
```

### `route.fetch: TargetClosedError`

**现象**：采集快完成时崩溃，日志末尾出现 `route.fetch: Target page, context or browser has been closed while running route callback`。

**原因**：浏览器关闭时仍有正在拦截的网络请求。已在 `BrowserLifecycleManager` 中添加 `unrouteAll` 和 try-catch 处理。如果仍然出现，更新到最新代码。

**解决**：

```bash
git pull origin main
```

---

## 登录问题

### 自动登录找不到表单字段

**现象**：执行账号密码登录时，日志显示 `无法定位登录输入框`，或提示用户名为 `username`、密码为 `password` 但实际并非如此。

**原因**：`LoginOracle` 通过字段名称/ID/placeholder/autocomplete/type 启发式检测表单字段。部分站点使用非常规命名或不标准属性。

**解决**：

1. **扫码登录优先**：使用菜单 **4. 📱 扫码登录**，绕过表单检测。

2. **手动指定选择器**：编辑 `config.json` 添加认证配置：
   ```json
   {
     "auth": {
       "loginUrl": "https://example.com/login",
       "verifyUrl": "https://example.com/user",
       "loggedInSelector": ".user-avatar"
     }
   }
   ```

3. **Web 面板手动登录**：启动菜单 **6. 🌍 启动 Web 可视化面板**，在浏览器中手动操作。

### 扫码登录检测不到成功

**现象**：扫码后程序未自动继续，最终提示 `扫码登录超时`。

**原因**：扫码登录轮询通过三个维度检测成功：
- URL 是否跳转
- Cookie 是否包含 `SESSDATA`/`sessionid`/`token` 关键词
- 页面 "登录" 按钮是否消失

**排查**：

1. 确认手机 App 确实扫了码并确认登录。
2. 检查目标站点是否有额外的二次确认步骤（如滑块验证或手机验证）。
3. 尝试在扫码前使用 `config.json` 增加超时：
   ```json
   {
     "taskTimeoutMs": 300000
   }
   ```

### 已存会话验证失败

**现象**：选择已存会话后，日志显示 `会话已失效，需要重新登录`，但浏览器直接打开无需扫码。

**原因**：会话验证使用 `domcontentloaded` + Cookie/URL/元素三维检查。如果验证发现页面仍存在 "登录" 按钮，会判定会话已过期。

**可能的原因**：

- **Cookie 过期**：站点的 `SESSDATA` 或 `session` Cookie 有有效期限制（B 站的 `SESSDATA` 有效期约 15 天）。
- **URL 验证地址不对**：确保 `verifyUrl` 是登录后可见的页面（如用户中心），而非登录页面本身。

**解决**：重新扫码登录一次即可。

---

## 性能问题

### 浏览器内存占用过高

**现象**：长时间运行后系统内存被占满，或操作系统提示内存不足。

**原因**：Playwright 浏览器进程每次采集都会创建新的 Chromium 实例。连续大批量采集时浏览器进程堆积。

**解决**：

1. **启用轻量 HTTP 引擎**：对于静态页面，`StrategyOrchestrator` 会自动选择 HTTP 引擎而非浏览器。确保 `HarvesterService` 构造时传入了 `ILightHttpEngine` 实例（当前仅通过 ArticleCaptureService 使用）。
2. **降低并发**：`tasks.json` 中设置低并发数：
   ```json
   {
     "concurrency": 1,
     "tasks": [...]
   }
   ```
3. **定期重启**：长时间批量采集后退出程序重新启动。

### 采集速度慢 / 单页耗时过长

**现象**：采集一个页面耗时超过 30 秒。

**原因**：
- 目标站点包含大量 CDN 资源（图片/视频）
- 页面有长轮询或 WebSocket 连接导致 `networkidle` 无法触发
- 网络延迟

**解决**：

1. 在 `config.json` 中将等待策略调整为 `domcontentloaded`：
   ```json
   {
     "actionTimeoutMs": 15000,
     "taskTimeoutMs": 30000
   }
   ```
2. 批量采集时增加任务间隔，避免反爬触发。
3. 使用 `npm run benchmark` 查看本地基线性能，与远程对比。

---

## 常见错误码速查表

| 错误码 | 含义 | 常见原因 | 解决 |
|--------|------|----------|------|
| `E001` | 非法 URL | 输入的网址格式不正确 | 检查 URL 是否包含 `https://` |
| `E004` | 空任务配置 | 未提供 targetUrl | 在 `tasks.json` 或菜单中填写 URL |
| `E101` | 浏览器启动失败 | Chromium 未安装 / 权限不足 | 运行 `npx playwright install chromium` |
| `E102` | 页面导航超时 | 目标页面加载过慢 | 增加 `actionTimeoutMs` |
| `E103` | 元素未找到 | CSS 选择器不匹配 | 检查选择器是否正确 |
| `E104` | 操作执行失败 | 页面状态与预期不符 | 检查 actions 配置 |
| `E201` | 网络捕获错误 | 浏览器关闭时仍有请求拦截 | 更新到最新代码 |
| `E202` | 脚本执行超时 | 自定义 JS 运行时间过长 | 简化 JS 脚本 |
| `E203` | 存储查询失败 | 跨域或受限页面 | 确认页面同源策略 |
| `E301` | 目录创建失败 | 输出目录权限不足 | 检查 `outputDir` 配置 |
| `E302` | 文件写入失败 | 磁盘空间不足 / 权限问题 | 清理磁盘或更改输出路径 |
| `E999` | 未知错误 | 未归类的异常 | 查看日志中的具体错误消息 |

---

## 调试技巧

### 查看详细日志

```bash
LOG_LEVEL=debug npm start
```

这会输出所有调试信息，包括网络请求捕获细节、选择器匹配过程等。

### 查看覆盖率报告

```bash
npx jest --coverage
open coverage/lcov-report/index.html    # macOS
start coverage/lcov-report/index.html   # Windows
```

### 本地运行单个测试

```bash
npx jest src/core/services/StrategyOrchestrator.test.ts
```

### E2E 测试

```bash
npm run test:e2e
```

E2E 测试使用本地 HTTP 服务器 + headless Chromium，不需要网络连接。
