import { CliDeps } from "../types";

export async function handleViewSessions(_deps: CliDeps): Promise<void> {
  const { FileSessionManager } = await import("../../adapters/FileSessionManager");
  const sm = new FileSessionManager();
  const list = await sm.listProfiles();
  if (list.length === 0) { console.log("📂 暂无已存会话\n"); return; }
  console.log("\n📂 已存会话：\n");
  for (const name of list) {
    const state = await sm.load(name);
    if (!state) { console.log(`  ${name} [无法读取]`); continue; }
    const created = new Date(state.createdAt).toLocaleString();
    const age = Math.round((Date.now() - state.createdAt) / 1000 / 60);
    const expired = age > 60 * 24 * 14;
    const status = expired ? "❌ 已过期" : "✅ 有效";
    console.log(`  ${name}`);
    console.log(`    创建: ${created} | Cookie: ${state.cookies.length} | ${status}`);
  }
  console.log("");
}
