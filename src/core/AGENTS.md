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
