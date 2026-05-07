# WebHarvester Project Learnings

## Git 纪律（强制）
- **严禁执行版本回退命令**：`git checkout -- .`、`git reset --hard`、`git restore .` 等会丢弃未提交的工作区修改。如有需要清理临时文件，用 `git clean -fd` 而非 `git checkout -- .`。
- 新的未跟踪文件（如 `src/services/ChromeService.ts`、测试文件等）必须及时 `git add` 并 `git commit`，防止因工作区清理而永久丢失。
- 所有修改应该通过小步提交（每完成一个独立功能即提交），而非累积大量未提交修改。

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
