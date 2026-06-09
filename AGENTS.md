# ⚠️ 每次操作前的预检清单

**在任何 write/edit/delete/move/refactor 操作之前，按顺序执行：**

```
[ ] 1. codegraph sync（索引最新）
[ ] 2. codegraph impact "要改的符号"（看影响范围）
[ ] 3. codegraph callers "要改的符号"（看调用者）
[ ] 4. codegraph callees "要改的符号"（看调用链）
```

跳过上述任何一步直接动手 → 必然遗漏影响范围。两次教训：
- 删 `codegraph.db` 前没查引用：侥幸没出错，但做法是错误的
- `as any` 清理时没跑 impact：E101 撞了已有错误码，改了三遍

---

# WebHarvester Project Learnings

实际案例：BaseCrawler 的 `tryBrowserFallback` + `quickCdpCheck` + `getPageUrlForApi` 全链被 codegraph `callers` 追踪发现均为零调用，一次删除 107 行死代码。如果只用 grep 搜 `tryBrowserFallback`，不会发现另外两个方法也在同一条死链上。

## 爬取工作流：从无到有

完整文档见 `docs/crawl-workflow.md`。核心路径：

```
第一阶段：侦察          CDP 浏览器 → 页面结构分析
第二阶段：API 发现      HAR 捕获 → 识别数据 API
第三阶段：API 分析      测试认证/签名要求
第四阶段：实施采集      根据分析选择采集方式
第五阶段：沉淀（可选）   封装为特化爬虫
```

### URL 爬取失败排查清单

| 现象 | 可能原因 | 验证方法 |
|------|---------|---------|
| HTTP 403 | WAF/CDN 拦截（zhihu 等） | 加浏览器头重试；使用 CDP 浏览器采集 |
| HTTP 404 | URL 错误/文章已删除 | 检查 ID 格式（知乎文章 ID 通常 7-12 位数字） |
| HTTP 429 | 频率限制 | 等待后重试；降低并发 |
| JSON code ≠ 0 | 需登录/签名 | 导入 Cookie；检查签名要求 |
| 空内容 / 超时 | SPA 未渲染 | 增加等待时间；使用 CDP 浏览器采集 |
| 内容长度 0 | SPA 需要 JS 渲染 | CDP 直连 Chrome 或使用 Puppeteer |

### 已知限制
- **知乎评论 API**: x-zse-96 签名算法需要周期性逆向更新。当前版本热搜可用，评论返回 403
- **抖音 API**: a_bogus 签名由浏览器运行时生成，无法纯 API 实现，必须使用 CDP 浏览器采集
- **BOSS直聘**: zp_token 签名 + 代理要求，Cookie 不足以独立使用
- **小红书**: 所有 API 需要登录 Cookie，无水印模式需额外签名

## Git 纪律（强制）
- **严禁执行版本回退命令**：`git checkout -- .`、`git reset --hard`、`git restore .` 等会丢弃未提交的工作区修改。如有需要清理临时文件，用 `git clean -fd` 而非 `git checkout -- .`。
- 新的未跟踪文件（如 `src/services/ChromeService.ts`、测试文件等）必须及时 `git add` 并 `git commit`，防止因工作区清理而永久丢失。
- 所有修改应该通过小步提交（每完成一个独立功能即提交），而非累积大量未提交修改。
- **文件只存在于编辑缓冲区未写入磁盘是无效的**：如果对 `write` 工具的调用失败或被跳过，文件不算创建。提交后务必检查 `git status` 确认文件确实被跟踪。

## Pre-commit Hooks
- 项目配置了 husky + lint-staged 作为 pre-commit 钩子。提交前自动运行 `eslint --fix`。
- 如果 lint-staged 失败（例如未使用的 import），提交会被阻止。需要手动修复后重新 `git commit`。
- 一次性文件创建（如 `Set-Content` 在 PowerShell 中）可能因编码问题导致 lint 错误。用 `write` 工具而非 shell 命令创建 .ts 文件。

## ESLint
- ESLint 9 requires `eslint.config.js` (flat config), not `.eslintrc.json`. The `typescript-eslint` v8 meta-package (`npm install typescript-eslint`) is needed for flat config.
- `no-magic-numbers` must ignore HTTP status codes: `ignore: [0, 1, -1, 200, 204, 400, 404, 500, 1000, 3000]`
- Empty catch blocks: configure `"no-empty": ["error", { "allowEmptyCatch": true }]`

## BrowserLifecycleManager
- Default `waitUntil` should be `"domcontentloaded"`, NOT `"networkidle"`. B站 and other heavy pages never reach networkidle within timeout due to background analytics requests.
- `page.route()` callbacks must be wrapped in try-catch. Close the page with `page.unrouteAll({ behavior: "ignoreErrors" })` before `page.close()` to prevent `TargetClosedError` from in-flight requests.
- Anti-detection init script must set `navigator.webdriver = false` (not `undefined`), simulate real plugin list (Chrome PDF Plugin, Chrome PDF Viewer, Native Client), and override `navigator.permissions.query`.

## Static Frontend
- `switchTab` function must accept explicit element parameter: `switchTab(tabId, el)` — do NOT rely on global `event.target`.
- Tour/Wizard navigation functions (`wizardGo`, `wizardNext`) must be `async` and `await` async data-loading calls like `loadUnits()`. Without `await`, the UI renders before API responses arrive.
- Inquirer checkbox prompt requires arrow-key scrolling; items beyond visible area are not shown unless user scrolls.

## node-fetch in CJS
- Dynamic `const { default: fetch } = await import("node-fetch")` does NOT work in CommonJS mode. Use top-level `import fetch from "node-fetch"` (with `esModuleInterop: true` in tsconfig) instead.

## Cross-Cutting: Source Identity Tags
- All collected units carry a `source` metadata tag (`bilibili_source`, `zhihu_source`, `xh_source`). This tag is used in CLI (`index.ts`) for display grouping and in downstream processing pipelines.
- When adding a new crawler, define a new source identity constant and use it consistently in `ContentUnit` metadata AND CLI display logic. Missing the tag causes the unit to appear in a "unknown source" catch-all group.

## TikTok Network Blocking
- TikTok blocks Node.js/Server IP ranges at the TCP level (`connect ETIMEDOUT`), regardless of signature correctness. Even correct X-Bogus headers won't help if the request originates from a data center IP.
- `HarvesterService` wraps `CrawlerDispatcher.fetch()` in try-catch so that TCP-level failures fall through to `LightHttpEngine` → `PlaywrightAdapter` (browser). This is the only reliable path for TikTok.
- The `tiktok-signature` npm package works via browser Puppeteer, but requires `PUPPETEER_EXECUTABLE_PATH` pointing to Playwright's Chromium binary.

## BodyTruncationMiddleware
- JSON responses (`Content-Type: application/json`) must NEVER be body-truncated. Truncating at 50KB/200KB mid-JSON produces invalid JSON that fails `JSON.parse()`.
- The middleware checks `Content-Type` header and skips truncation for `application/json`. Non-JSON responses (HTML, text) are truncated at 200KB.

## Xiaohongshu INITIAL_STATE Safe Extraction
- `window.__INITIAL_STATE__` contains circular references (property `'sub'` closes the circle). Direct access or `JSON.stringify` on it always fails.
- The safe pattern: use string-path navigation (`get(obj, 'note.noteDetailMap')`) with null checks at every path segment. NEVER assign a deep sub-object to a variable — use `getStr(noteObj, 'key.user.userId')` that navigates one segment at a time.
- Fallback order: browser-side flat extraction → `page.content()` regex extraction → return `{}`.
