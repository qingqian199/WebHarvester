# WebHarvester Project Learnings

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
