import fs from "fs/promises";
import path from "path";
import { ZodError } from "zod";
import { AppConfig, DEFAULT_APP_CONFIG, validateConfig } from "../core/config/app-config";

const CONFIG_PATH = path.resolve("./config.json");

export async function loadAppConfig(): Promise<AppConfig> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    // Zod 校验：错误配置立即退出
    validateConfig(parsed);
    return { ...DEFAULT_APP_CONFIG, ...parsed };
  } catch (err) {
    if (err instanceof ZodError) {
      console.error("\n❌ config.json 校验失败:");
      for (const issue of err.issues) {
        console.error(`   - ${issue.path.join(".")}: ${issue.message}`);
      }
      console.error("\n💡 请检查 config.json 中的配置项，修正后重新启动。\n");
      process.exit(1);
    }
    if (err instanceof SyntaxError) {
      console.error("\n❌ config.json 不是合法的 JSON:", (err as Error).message);
      console.error("💡 请检查文件格式。\n");
      process.exit(1);
    }
    return DEFAULT_APP_CONFIG;
  }
}


