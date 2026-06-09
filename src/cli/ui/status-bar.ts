/**
 * 顶部状态栏 — 在菜单之前显示系统状态
 */
import { FeatureFlags } from "../../core/features";
import fs from "fs";
import path from "path";

export interface StatusInfo {
  chrome: "ready" | "degraded" | "stopped";
  proxy: boolean;
  outputCount: number;
  sessionCount: number;
  lastCrawl?: string;
}

export function getStatusInfo(): StatusInfo {
  let chrome: StatusInfo["chrome"] = "stopped";
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getChromeServiceHealth } = require("../../utils/chrome-service-bridge");
    const health = getChromeServiceHealth();
    if (health) chrome = health.status === "ready" ? "ready" : "degraded";
  } catch {}

  const proxy = FeatureFlags.enableProxyPool;
  let outputCount = 0;
  let lastCrawl: string | undefined;
  try {
    const outDir = path.resolve("output");
    if (fs.existsSync(outDir)) {
      const dirs = fs.readdirSync(outDir, { withFileTypes: true }).filter((d) => d.isDirectory());
      let newest: { file: string; mtime: Date } | null = null;
      for (const dir of dirs) {
        const files = fs.readdirSync(path.join(outDir, dir.name));
        for (const f of files) {
          if (!f.endsWith(".json") && !f.endsWith(".har") && !f.endsWith(".txt") && !f.endsWith(".html")) continue;
          const st = fs.statSync(path.join(outDir, dir.name, f));
          if (!newest || st.mtime > newest.mtime) newest = { file: dir.name, mtime: st.mtime };
          outputCount++;
        }
      }
      if (newest) {
        const ago = Math.floor((Date.now() - newest.mtime.getTime()) / 60000);
        lastCrawl = `${ago}分钟前 (${newest.file})`;
      }
    }
  } catch {}

  let sessionCount = 0;
  try {
    const sessionDir = path.resolve("sessions");
    if (fs.existsSync(sessionDir)) {
      const dirs = fs.readdirSync(sessionDir, { withFileTypes: true }).filter((d) => d.isDirectory());
      for (const dir of dirs) {
        const files = fs
          .readdirSync(path.join(sessionDir, dir.name))
          .filter((f) => f.endsWith(".json") && f !== "_meta.json" && f !== "wbi_keys.json");
        sessionCount += files.length;
      }
    }
  } catch {}

  return { chrome, proxy, outputCount, sessionCount, lastCrawl };
}

export function renderStatusBar(status: StatusInfo): string {
  const chromeIcon = status.chrome === "ready" ? "🟢" : status.chrome === "degraded" ? "🟡" : "🔴";
  const proxyIcon = status.proxy ? "🟢" : "🔴";
  const parts = [`Chrome${chromeIcon}`, `Proxy${proxyIcon}`, `📦${status.outputCount}`, `🔐${status.sessionCount}`];
  if (status.lastCrawl) parts.push(`⏱️${status.lastCrawl}`);
  return parts.join(" | ");
}
