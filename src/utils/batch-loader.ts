import fs from "fs/promises";
import path from "path";
import { BatchTaskList } from "../core/config/app-config";

const TASKS_PATH = path.resolve("./tasks.json");

export async function loadBatchTasks(): Promise<BatchTaskList> {
  try {
    const raw = await fs.readFile(TASKS_PATH, "utf-8");
    const data = JSON.parse(raw) as BatchTaskList;
    if (!Array.isArray(data.tasks)) data.tasks = [];
    return data;
  } catch {
    return { tasks: [] };
  }
}

export function getSafeDomainName(url: string): string {
  try {
    const host = new URL(url).hostname;
    return host.replace(/[^a-zA-Z0-9_-]/g, "_");
  } catch {
    return "unknown_site";
  }
}
