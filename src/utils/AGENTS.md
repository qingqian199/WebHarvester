# Utility Module Learnings

## BrowserSignatureService
- Generic service for sites that need browser-based signature generation (e.g., TikTok X-Bogus).
- Register a site: `registerBrowserSignature('tiktok', { port: 8080, healthEndpoint: '/health', signatureEndpoint: '/signature' })`.
- `signWithBrowser(site, url, headers, body, cookie)` calls the registered HTTP service, extracts `X-Bogus`, `X-Gnarly`, `msToken` from the signed URL.
- Service unavailable → throws. Callers should catch and fall back to JS-based signing.
- Default registration: `tiktok` → port 8080 (tiktok-signature server).

## safe-serialize.ts
- `safeExtractInitialState(browser)`: three-layer fallback for extracting `window.__INITIAL_STATE__` from Xiaohongshu pages without triggering circular reference crashes.
- Layer 1: browser-side extraction using string-path access (`get(obj, 'key.subkey')`), only primitive return values.
- Layer 2: `page.content()` → regex extract `window.__INITIAL_STATE__= {...};` from HTML.
- Layer 3: return `{}`.
- The `get()` helper navigates one path segment at a time with null checks, never directly assigning deep object references.

## RateLimiter
- `getRateLimiter(site)` returns a per-site singleton. `throttle()` adds random 500-1500ms delay. `onRateLimitError(code)` sets 5-15 minute cooldown with jitter.
- RATE_LIMIT_CODES: bilibili=[-352], xiaohongshu=[300011], zhihu=[], tiktok=[10202,10203,10213,10221].

## RoundRobinProxyProvider in config
- Proxy config format: `{ enabled: bool, proxies: [{host, port, protocol, username?, password?}] }`.
- HTTP requests use `getProxiedAgent(url, proxy)` which sets env vars `HTTP_PROXY`/`HTTPS_PROXY`.
- Browser launch uses `--proxy-server=${protocol}://${host}:${port}` Chromium arg.
