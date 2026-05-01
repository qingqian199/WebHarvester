# Crawler Shared Patterns

## Request Environment
- All three crawlers use `buildBrowserHeaders(fp, referer)` from `src/utils/browser-env.ts` to get a consistent set of browser-like headers including `sec-ch-ua`, `sec-ch-ua-platform`, `sec-ch-ua-mobile`.
- Missing `sec-ch-ua` headers cause B站's risk control to return `code=-352`. Always include them.

## common Headers That Must Be Set
- `Referer` must match the endpoint's page context (e.g., `space.bilibili.com/xxx` for space API).
- `Cookie` must include device fingerprint cookies (`buvid3`, `b_lsid` for B站; `a1` for 小红书), not just auth tokens.

## Fallback Pattern (collectUnits)
- Each unit in `collectUnits` should try signature first, then fall back to `html_extract` on failure.
- For B站, `code=-352` means risk control: wait 3s, retry once, then fall back.

## URL Resolver Timing
- URL resolution (`resolveBilibiliUrl`, `resolveZhihuUrl`, `resolveXiaohongshuUrl`) must run in the CLI handler (`index.ts`) BEFORE parameter prompts, not inside `collectUnits`. Otherwise users are asked for params that the URL already provides.

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
- `bili_search` tries signature first (`/wbi/search/type`), catches errors, falls to html_extract.
- `bili_user_videos` tries signature (will -403), immediately falls to html_extract.

## Xiaohongshu-Specific
- `X-s-common` header must be a base64-encoded JSON object with fields `{s0,s1,x0,x1,x2,x3,x4,x5,x6,x7}`. Simple string concatenation does NOT match what the server expects.
- Search POST (`/api/sns/web/v1/search/notes`) requires complete body: `{keyword, page, page_size, search_id, sort, note_type:0, ext_flags:[], image_formats:["jpg","webp","avif"]}`. Missing `search_id`, `note_type`, `ext_flags`, or `image_formats` causes `code=300011` (account risk control).
- The `a1` cookie is REQUIRED for X-s signature generation (passed to `generateXsHeader` as cookieMap). Without it, signatures are incorrect.
- Guest mode: filter out `web_session` / `id_token` cookies; keep only `a1`, `buvid`, `device`, `webId`.

## Zhihu-Specific
- `/api/v4/me` and `/api/v4/members/{id}` work with x-zse-96 signature (verified).
- `/api/articles/{id}` (zhuanlan subdomain) returns 403 with x-zse-96 — needs different signing or the zhuanlan-specific endpoint.
- Zhihu's `x-api-version` header must be `"3.0.40"`.
