import inquirer from "inquirer";
import { HarvestConfig } from "../core/models";

export async function startInteractiveCli(): Promise<{ mode: "single" | "batch"; singleConfig?: HarvestConfig }> {
  const { runMode } = await inquirer.prompt([
    { type: "list", name: "runMode", message: "请选择运行模式", choices: [{ name: "单站点交互式采集", value: "single" }, { name: "批量任务采集(tasks.json)", value: "batch" }], default: "single" }
  ]);

  if (runMode === "batch") {
    return { mode: "batch" };
  }

  const ans = await inquirer.prompt([
    { type: "input", name: "targetUrl", message: "输入目标网址：", validate: v => !!v.trim() || "不能为空" },
    { type: "checkbox", name: "captureItems", message: "选择采集内容：", choices: [
      { name: "全量网络请求", value: "network", checked: true },
      { name: "DOM元素", value: "element" },
      { name: "Cookie/存储", value: "storage", checked: true },
      { name: "自定义JS", value: "script" }
    ] }
  ]);

  const cfg: HarvestConfig = {
    targetUrl: ans.targetUrl.trim(),
    networkCapture: ans.captureItems.includes("network") ? { captureAll: true } : { captureAll: false },
    elementSelectors: ans.captureItems.includes("element") ? ["input", "form"] : [],
    storageTypes: ans.captureItems.includes("storage") ? ["localStorage", "sessionStorage", "cookies"] : [],
    jsScripts: ans.captureItems.includes("script") ? [] : []
  };

  return { mode: "single", singleConfig: cfg };
}
