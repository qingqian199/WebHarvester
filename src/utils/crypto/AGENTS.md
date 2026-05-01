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
- `generateXsHeader(path, data, cookies)` returns `{ "X-s": "XYS_...", "X-t": "..." }`. The `X-s` starts with `XYS_` prefix followed by custom-base64-encoded JSON.
- Custom base64 uses alphabet `0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_` (not standard `A-Za-z0-9+/`).

## 知乎 x-zse-96
- Algorithm: `"2.0_" + base64(hex(md5(path + "?" + params)))`. Simple MD5 of path+params → hex → base64.
