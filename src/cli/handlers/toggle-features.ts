import fs from "fs/promises";
import { CliDeps } from "../types";
import { FeatureFlags } from "../../core/features";

export async function handleToggleFeatures(_deps: CliDeps): Promise<void> {
  const { default: inq } = await import("inquirer");
  const flags = Object.entries(FeatureFlags);
  console.log("\n⚙️ 功能开关：\n");
  const unimplemented = ["enableParallelTask", "enableBrowserPool", "enableDaemonProcess"];
  for (const [k, v] of flags) {
    const note = unimplemented.includes(k) ? " (未实现)" : "";
    console.log(`  ${v ? "✅" : "⬜"} ${k}${note}`);
  }
  const { flagName } = await inq.prompt([
    { type: "list", name: "flagName", message: "选择要切换的开关：", choices: flags.map(([k]) => ({ name: `${k} (${FeatureFlags[k as keyof typeof FeatureFlags] ? "开" : "关"})`, value: k })) }
  ]);
  const k = flagName as keyof typeof FeatureFlags;
  if (unimplemented.includes(k as string)) {
    console.log(`\n⚠️ ${k} 未实现，无法切换\n`);
    return;
  }
  FeatureFlags[k] = !FeatureFlags[k];
  try {
    const raw = await fs.readFile("config.json", "utf-8");
    const cfg = JSON.parse(raw);
    if (!cfg.features) cfg.features = {};
    cfg.features[k] = FeatureFlags[k];
    await fs.writeFile("config.json", JSON.stringify(cfg, null, 2), "utf-8");
    console.log(`\n✅ ${flagName} 已切换为 ${FeatureFlags[k] ? "开启" : "关闭"}（已保存到 config.json）\n`);
  } catch {
    console.log(`\n✅ ${flagName} 已切换为 ${FeatureFlags[k] ? "开启" : "关闭"}（重启后恢复默认）\n`);
  }
}
