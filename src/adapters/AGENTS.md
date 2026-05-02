# Adapter Layer Learnings

## BrowserLifecycleManager
- `launch()` accepts a `pageSetup(page)` callback that runs AFTER page creation but BEFORE `page.goto()`. This is the correct place to set up route interceptors that need to capture navigation-initiated requests.
- The `page.on('request')` event fires AFTER the security SDK has modified headers. The `page.route()` handler fires BEFORE SDK modification. For TikTok/Xiaohongshu, the SDK injects signatures between these two events, so `page.on('request')` headers are the REAL headers sent over the wire.
- To capture both: use `page.route()` for response bodies (via `route.fetch()`), use `page.on('request')` for final request headers.

## RoundRobinProxyProvider
- Proxies are removed from the pool after 3 consecutive failures reported via `reportFailure()`.
- Uses round-robin assignment (index % pool.length).
- Enable via `config.json` → `proxyPool.enabled` and `FeatureFlags.enableProxyPool`.

## PQueueTaskQueue
- In-memory priority queue with configurable concurrency (default 2).
- Tasks sorted by `priority` field (lower = higher priority).
- `onComplete(taskId, result)` stores result in Map; `getResult(taskId)` retrieves it.
- `drain()` is called recursively whenever a task completes or fails.
- Designed for WebServer async task processing, not for multi-process distribution.
