# Crypto / Signing Utils

## XXTEA
- XXTEA operates on 32-bit unsigned integers. ALL intermediate values in JavaScript must be wrapped with `>>> 0` to enforce 32-bit unsigned behavior. Even addition results need wrapping.
- Input/output must be 4-byte aligned. Non-aligned inputs are padded with null bytes. After decryption, trim trailing null bytes with `replace(/\0+$/, "")`.
- The MX value formula is `(a + b) ^ c` where each sub-expression is wrapped to 32-bit. Using `(a ^ b) + c` instead produces wrong results that still XOR/decrypt into garbage.
- `q = 6 + Math.floor(52 / n)`, not `6 + 52 / n` (JavaScript floating division).

## B站 WBI Signing
- `buildSignedQuery(params, imgKey, subKey)` requires the mixin key permutation table `MIXIN_KEY_ENC_TAB`. This is a fixed 64-element array derived from B站 frontend JS. The table itself never changes — only img_key/sub_key rotate.
- WBI keys are URL-encoded in localStorage: `wbi_img_url: "https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077"`. Extract via path parsing, not regex on the full key.

## 小红书 X-s Signing
- `generateXsHeader(path, data, cookies)` returns `{ "X-s": "XYS_...", "X-t": "..." }`. The REAL X-s is `"XYS_" + mnsv2(...)` DIRECTLY — NOT wrapped in JSON.stringify({x0,x1,x2,x3,x4}).
- Custom base64 uses alphabet `0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_` (not standard `A-Za-z0-9+/`).
- The browser-observed X-s may differ from `generateXsHeader` output because the anti-crawl SDK adds a secondary processing layer. To get the correct signature, inject via Playwright route interception (`setupSignatureInjection`) that replaces the SDK's X-s after the SDK has already injected dynamic trace headers (X-B3-TraceId, X-Xray-TraceId).

## 知乎 x-zse-96
- Algorithm: `"2.0_" + base64(hex(md5(path + "?" + params)))`. Simple MD5 of path+params → hex → base64.

## TikTok X-Bogus (Bytecode VM)
- X-Bogus is NOT implemented in JavaScript source code. The `webmssdk.js` u[995] function is a 1-line dispatcher: `{ v: function(n,r) { return x(50811, t, this, arguments, 0, 96) } }`. The `x()` function is a custom bytecode VM interpreter.
- X-Bogus is injected at a level below both Playwright `page.on('request')` AND CDP `Network.requestWillBeSent`. Neither can capture the final header value. System-level proxy (mitmproxy) is also ineffective due to certificate pinning.
- The algorithm lives in bytecode stored by key `50811` inside the `x()` interpreter. Reverse engineering requires decompiling the bytecode VM, not the JavaScript.
- 14 API endpoints documented, all `sig_pending`. The only reliable path is browser-based page extraction (`SIGI_STATE.ItemModule`).

## MIXIN_KEY_ENC_TAB (WBI)
- `MIXIN_KEY_ENC_TAB` is defined in `bilibili-signer.ts` and exported. `stub-generator.ts` imports it rather than duplicating. Generated JS stub code uses `MIXIN_KEY_ENC_TAB.join(", ")` interpolation — ONLY `bilibili-signer.ts` is the source of truth.
- `extractWbiKey(url)` in `bilibili-signer.ts` is the SINGLE source of truth for WBI key extraction from localStorage URLs. Both `index.ts` and `stub-generator.ts` import and use it. The old index.ts inline `extractKey` had a different algorithm.

## BaseCrawler Dedup & Formatting Helpers
- `dedupComments(items)`: deduplicates comment arrays by `rpid + content.message + member.uname`. Returns `{ data, deduped_count }`.
- `fmtTime(ts)`: converts Unix seconds or milliseconds to ISO 8601. Added to comment output in `bili_video_comments` and `bili_video_sub_replies`.
- `safeNum(val)`: converts to number, defaults to 0 for NaN/null/undefined.
