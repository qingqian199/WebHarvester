import fs from "fs/promises";

export async function handleViewConfig(): Promise<void> {
  const raw = await fs.readFile("config.json", "utf-8");
  const cfg = JSON.parse(raw);
  const masked = JSON.stringify(cfg, (key, val) => {
    if (typeof val === "string" && val.length > 20 && (key.includes("token") || key.includes("key") || key.includes("secret"))) {
      return val.slice(0, 8) + "****" + val.slice(-4);
    }
    return val;
  }, 2);
  console.log("\n📋 当前配置：\n");
  console.log(masked);
  console.log("");
}
