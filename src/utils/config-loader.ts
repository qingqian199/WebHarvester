import fs from "fs/promises";
import path from "path";
import { AppConfig, DEFAULT_APP_CONFIG } from "../core/config/app-config";

const CONFIG_PATH = path.resolve("./config.json");

export async function loadAppConfig(): Promise<AppConfig> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf-8");
    const userCfg = JSON.parse(raw) as Partial<AppConfig>;
    return { ...DEFAULT_APP_CONFIG, ...userCfg };
  } catch {
    return DEFAULT_APP_CONFIG;
  }
}

export async function generateDefaultConfigFile(): Promise<void> {
  await fs.writeFile(CONFIG_PATH, JSON.stringify(DEFAULT_APP_CONFIG, null, 2), "utf-8");
}
