# Crawler Shared Patterns

## Request Environment
- All three crawlers use `buildBrowserHeaders(fp, referer)` from `src/utils/browser-env.ts` to get a consistent set of browser-like headers including `sec-ch-ua`, `sec-ch-ua-platform`, `sec-ch-ua-mobile`.
- Missing `sec-ch-ua` headers cause B站's risk control to return `code=-352`. Always include them.

## common Headers That Must Be Set
- `Referer` must match the endpoint's page context (e.g., `space.bilibili.com/xxx` for space API).
- `Cookie` must include device fingerprint cookies (`buvid3`, `b_lsid` for B站; `a1` for 小红书), not just auth tokens.

## Middleware Pipeline Architecture
- `BaseCrawler` now uses `MiddlewarePipeline` instead of inline fetch logic. Default chain: `FingerprintMiddleware` → `RateLimitMiddleware` → `BrowserSignatureMiddleware` → `RetryMiddleware` → `BodyTruncationMiddleware`.
- `RetryMiddleware` wraps the inner chain to detect rate-limit codes (-352, 300011, 429). Exhaustion throws an error (no extra bare fetch).
- `BrowserSignatureMiddleware` checks `hasBrowserSignature(site)` and calls `signWithBrowser()` for sites registered via `registerBrowserSignature()`. Service unavailable → silent degradation.
- Subclass can call `registerMiddleware(mw)` to add custom middleware or override `buildDefaultPipeline()` for a custom chain.

## runWithConcurrency Now in BaseCrawler
- `runWithConcurrency<T,R>(items, concurrency, fn)` is now a `protected` method on `BaseCrawler`. BilibiliCrawler's private copy has been removed.
- Used by all three crawlers for sub-reply auto-traversal (concurrency=3).

## Sub-Reply Auto-Traverse Pattern
- `note_sub_replies` / `zhihu_sub_replies` / `bili_video_sub_replies` use identical pattern:
  1. Find `_comments` result in results[] array
  2. Extract all rpids/comment_ids
  3. `runWithConcurrency(rpids, 3)` → each rpid does cursor pagination sub-api
  4. Group by rpid, count total

## Scout-Based ID Extraction
- `TikTokCrawler.scoutIds()` and `XhsCrawler` note_id scout both open a page, wait for content, extract missing parameters from embedded JSON, and fill `params`.
- TikTok: opens foryou page → reads `SIGI_STATE.ItemModule` → extracts `video_id` and `unique_id`. If keyword provided, opens search page → reads `__UNIVERSAL_DATA_FOR_LAYOUT__` → extracts search results' IDs.
- Xiaohongshu: opens user profile → reads `__INITIAL_STATE__` → extracts first note_id.
- All scout methods include proper `finally` cleanup (browser.close).

## collectUnits Sequential Processing
- ALL crawlers process units via `for...of` loop (sequential). `runUnitsParallel` helper exists in BaseCrawler but is NOT used because each unit's switch-case logic has complex retry/fallback that doesn't cleanly decompose to a `unit → Promise<UnitResult>` factory.
- To parallelize, switch-case must be refactored to a `unit → Promise<UnitResult>` function first.

## Fallback Pattern (collectUnits)
- Each unit in `collectUnits` should try signature first, then fall back to `html_extract` on failure.
- For B站, `code=-352` means risk control: wait 3s, retry once, then fall back.

## URL Resolver Timing
- URL resolution (`resolveBilibiliUrl`, `resolveZhihuUrl`, `resolveXiaohongshuUrl`) must run in the CLI handler (`index.ts`) BEFORE parameter prompts, not inside `collectUnits`. Otherwise users are asked for params that the URL already provides.

## sec-ch-ua Header Generation
- `sec-ch-ua` must contain DYNAMIC version strings (e.g. `"Chromium";v="130", "Not A Brand";v="99"`), not a hardcoded value. Stale version strings trigger B站 -352 risk control even with correct cookies.
- `buildBrowserHeaders(fp, referer)` generates this from the fingerprint's browser version. If the fingerprint has no version, it defaults to an empty string — which will also cause -352.

## Fallback Strategies Differ Per Unit
- `bili_search`: optimistic — tries signature API first, catches errors, falls to html_extract.
- `bili_user_videos`: pessimistic — tries signature knowing it will -403 (documented behavior), immediately falls to html_extract without error handling.
- Both look like "try → fallback" from outside but have different error-handling expectations. When adding a new unit, decide: does the API endpoint sometimes work (optimistic) or never work (pessimistic)?

## BilibiliCrawler-Specific

### WBI Keys
- WBI `img_key`/`sub_key` expire periodically. HARDCODED DEFAULTS WILL STALE. Load from `session.localStorage.wbi_img_url` / `wbi_sub_url` by parsing the URL path: `url.split("/").pop().split(".")[0].split("-").slice(1).join("-")`.
- `setWbiKeys(imgKey, subKey)` must be called BEFORE `fetchApi`.

### B站 Endpoint Rules
- `/x/web-interface/view?bvid=xxx` does NOT need WBI signature (public). Use for BV→AID conversion without needing session.
- `/x/space/wbi/arc/search` returns `-403` regardless of signature quality — has independent permission checks. Use html_extract.
- Video comments: `oid` = video AID. Add `mode=3` (hot sort), `ps=20` (page size). Auto-paginate with `pn`.
- `code=-352` = risk control: add 3s delay + 1 retry. Missing `sec-ch-ua` headers cause -352. Valid `buvid3` cookie required.

### Content Units
- `bili_video_comments` uses `requiredParams: ["aid"]` not `oid`. `fetchApi` auto-maps `aid`→`oid` via `{ oid }` template replacement.
- **Comment pagination must use cursor mode (`next` parameter), NOT `pn` (page number).** The `/x/v2/reply/main` endpoint returns `cursor.next` and `cursor.is_end`. Start with `next=0`, then use the value from the previous response's `cursor.next`. Stop when `cursor.is_end === true`.
- **`is_end` check**: `if (cursor.is_end) break;` (NOT `if (!cursor.is_end) break;` — that inverts the logic and bails after the first page).
- **Two-tier comment model**: `bili_video_comments` gets top-level comments (each includes up to 3 hot replies from B站). `bili_video_sub_replies` gets all sub-replies for ONE comment identified by `root` (the `rpid` from a top-level comment). The sub-reply endpoint is `/x/v2/reply` (NOT `/x/v2/reply/main`), with `root={rpid}`.
- `bili_search` tries signature first (`/wbi/search/type`), catches errors, falls to html_extract.
- `bili_user_videos` tries signature (will -403), immediately falls to html_extract.

## Xiaohongshu-Specific
- `X-s-common` header must be a base64-encoded JSON object with fields `{s0,s1,x0,x1,x2,x3,x4,x5,x6,x7}`. Simple string concatenation does NOT match what the server expects.
- Search POST (`/api/sns/web/v1/search/notes`) requires complete body: `{keyword, page, page_size, search_id, sort, note_type:0, ext_flags:[], image_formats:["jpg","webp","avif"]}`. Missing `search_id`, `note_type`, `ext_flags`, or `image_formats` causes `code=300011` (account risk control).
- The `a1` cookie is REQUIRED for X-s signature generation (passed to `generateXsHeader` as cookieMap). Without it, signatures are incorrect.
- Guest mode: filter out `web_session` / `id_token` cookies; keep only `a1`, `buvid`, `device`, `webId`.
- **Signature Injection**: `setupSignatureInjection(page, session)` is a Playwright route interceptor that lets the XHS SDK run in-browser (generating dynamic trace headers `X-B3-TraceId`, `X-Xray-TraceId`) then REPLACES the SDK's X-s/X-t/X-s-common with our `generateXsHeader` output. This is the correct way to get both SDK dynamic headers AND correct signatures. The interceptor is set up as a `pageSetup` callback in `fetchPageContent()`.
- **`__INITIAL_STATE__` Circular References**: The page state object has circular refs (property `'sub'` closes the circle). NEVER directly access deep sub-objects. Use `safeExtractInitialState(browser)` from `src/utils/safe-serialize.ts` which uses string-path based safe access (`get(obj, 'note.noteDetailMap')`) with null checks at every path segment.
- **Three ways to extract INITIAL_STATE**: (1) browser-side flat extraction (only primitives, safe), (2) `page.content()` regex extraction from HTML script tag, (3) DOM fallback. All three fail → `{}`.
- **Author ID from explore URL**: When input is an explore URL and user_id is needed, `collectUnits` first executes `note_detail`, extracts `userId` from the result, then injects it into params for `user_info`/`user_posts`.
- **Comment API response format is `{ data: { comments, cursor: string, has_more: boolean } }`**, NOT `{ data: { comments, cursor: { next, is_end } } }`. The old code expected `cursor.next`/`cursor.is_end` which don't exist. Correct field: `data.has_more` as boolean, `data.cursor` as plain string.
- **Comment API requires `xsec_token` in URL**. Without it, the page returns 404/access denied. The `xsec_token` is extracted from the page URL. When calling the API, append `&xsec_token=...` and `&xsec_source=...` query parameters.
- **`page.evaluate(() => fetch(url))` generates invalid X-s signatures** (returns code 300011). Even though `window.fetch` IS patched by the page's JS, the patched version produces wrong signatures in evaluate context. Only the page's own internal API client generates valid signatures. Fix: use `XMLHttpRequest` inside `page.evaluate` (circumvents the broken fetch polyfill), or intercept the page's own API calls via `page.on("response")`.
- **`node_fetch_1 is not defined` error**: The XHS page's webpack bundle wraps `fetch` with a conditional `require("node-fetch")` that fails in browser `page.evaluate` context. Using `XMLHttpRequest` avoids this entirely.
- **Page only loads 10 top-level comments automatically**. It does NOT provide UI for loading more. The remaining 1241+ comments require API-level cursor pagination with valid X-s signatures. Since `page.evaluate(fetch)` can't generate valid signatures, use `page.waitForResponse()` to intercept the page's own API calls, or extract from `__INITIAL_STATE__` if available.
- **commentTarget is a Vue 3 ref** (`__v_isRef`, `_value`), not a plain object. The initial SSR data (`__INITIAL_STATE__`) does NOT contain comments — comments are loaded via API after client hydration.

## Common: page.evaluate fetch vs XMLHttpRequest
- Some Chinese SPA sites (Xiaohongshu, etc.) patch `window.fetch` with webpack wrappers that reference Node.js modules. Calling `fetch()` inside `page.evaluate` fails with `node_fetch_1 is not defined`.
- **Fix**: Use `XMLHttpRequest` instead of `fetch` in `page.evaluate` blocks:
  ```typescript
  const xhr = new XMLHttpRequest();
  xhr.open("GET", url, true);
  xhr.withCredentials = true;
  xhr.onload = () => resolve(JSON.parse(xhr.responseText));
  xhr.send();
  ```
- This was fixed in `BaseCrawler.browserFetch()` — the method now uses XHR instead of fetch.

## Zhihu-Specific
- `/api/v4/me` and `/api/v4/members/{id}` work with x-zse-96 signature (verified).
- `/api/articles/{id}` (zhuanlan subdomain) returns 403 with x-zse-96 — needs different signing or the zhuanlan-specific endpoint.
- Zhihu's `x-api-version` header must be `"3.0.40"`.
