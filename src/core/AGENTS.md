# Core Services

## DataClassifier
- `classify(result)` produces `{ core: { apiEndpoints, authTokens, deviceFingerprint, antiCrawlDefenses }, secondary: {...} }`.
- `apiEndpoints` filters out tracking domains (`data.bilibili.com`, `cm.bilibili.com`, `as.xiaohongshu.com`, etc.) and static assets. This means some real API endpoints may be missing from `core.apiEndpoints` if they happen to match tracking filters.
- Use `extract-endpoints` script (not just DataClassifier) when you need the COMPLETE raw endpoint list for crawler development.

## HarvesterService
- Constructor injects `ILightHttpEngine` and `CrawlerDispatcher`. The dispatcher is checked FIRST before the HTTP engine or browser path.
- `logClassification(result)` is called after every save. It runs DataClassifier and logs `{ coreApiCount, authTokens, antiCrawl, secondaryRequests }`.

## ContentUnit
- `requiredParams` should use the most commonly available parameter name. For example, `bili_video_comments` uses `aid` not `oid` because URL resolvers extract `aid`. The `fetchApi` handles the `aid`→`oid` mapping.

## HarvesterService.save() + extract-endpoints
- When investigating why a specific endpoint isn't captured, run the `extract-endpoints` script FIRST before debugging `HarvesterService.save()`. The DataClassifier's tracking domain filter may have silently excluded the endpoint. The script bypasses classification and gives the complete raw list.

## HarvesterService.crawlerDispatcher Try-Catch
- `crawlerDispatcher.fetch()` is wrapped in try-catch. If a crawler's direct HTTP fetch throws (e.g., TikTok ETIMEDOUT), it falls through to `LightHttpEngine` → `PlaywrightAdapter`. Without this try-catch, TCP-level network failures crash the entire harvest.

## StrategyOrchestrator.scout()
- `scout(url)` sends a reconnaissance HEAD/GET request (redirect: manual, 5s timeout) BEFORE the main fetch to detect JS challenges (Cloudflare 503, challenge patterns), 302 redirects, and SPA shells.
- Results cached per-domain for 30 minutes (`Map<hostname, {engine, expiresAt}>`).
- `clearCache()` available for testing.
- JS challenge detection patterns: `cdn-cgi/challenge-platform`, `cf-browser-verification`, `__cf_chl_frm`, `Next.js Challenge`.

## FeatureFlags from config.json
- FeatureFlags are now loaded from `config.json` via `applyFeatureFlags(appCfg.features)` at bootstrap, not hardcoded.
- 4 unimplemented flags (`enableParallelTask`, `enableBrowserPool`, `enableProxyPool`, `enableDaemonProcess`) are forced to `false` after loading.
- `handleToggleFeaturesAction` persists changes back to `config.json`.

## QR Login Modes
- CLI QR login has two modes: (1) **manual** (default): opens browser, waits for user to press Enter, captures session, asks "save?"; (2) **auto-save**: polls for auth cookie automatically, saves immediately. Enable auto-save via `--auto-save` CLI arg or `config.json` → `auth.qrLoginAutoSave: true`.
- `readline.createInterface` conflicts with `inquirer` on stdin. Use `inquirer.prompt([{ type: "input", ... }])` for "press Enter to continue" instead of creating a separate readline interface.

## ContentUnit sort parameter
- Search units now accept a `sort` parameter: B站 (`totalrank/click/pubdate/dm/stow`), 小红书 (`general/time_descending/popularity_descending`), 知乎 (`time/hot/relevance`).
- Defined in `ContentUnitDef.optionalParams[]` and passed through to `fetchApi` params.
