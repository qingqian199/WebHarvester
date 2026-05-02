# Web Server Learnings

## CRITICAL: Task Queue Integration
- `WebServer` has `enableTaskQueue(maxConcurrency)` that creates a `PQueueTaskQueue` and registers a processor that routes harvest tasks to the appropriate crawler.
- `POST /api/task` submits a `HarvestTask` → enqueues → returns `{taskId, status}`. Client polls `GET /api/task/:taskId`.
- `GET /api/task/:id` returns `{completed, result/error, queueStatus}`.
- `/health` endpoint reads `taskQueue.getStatus().pending` for `taskQueueLength`.
- Without `enableTaskQueue()` call, the WebServer runs synchronously (current behavior).

## Signature Injection via Route
- `POST /api/login/qrcode` starts the TikTok/Xiaohongshu QR code login flow. For manual mode (no auto-save), it opens a browser and returns immediately. The frontend shows "我已登录" button.
- `POST /api/login/qrcode/confirm` is called in two phases:
  1. Without `save: true` → checks auth cookies, captures session, returns `{sessionData, userInfo}`.
  2. With `save: true` + `sessionData` → saves to disk.

## QR Login Lifecycle
- `sessionContext` holds `{lcm, page, profile, loginUrl}` across HTTP requests for manual QR login.
- `POST /api/login/qrcode/cleanup` closes the context if the user cancels.
- This stateful approach has a security implication: only one concurrent QR login is supported.
