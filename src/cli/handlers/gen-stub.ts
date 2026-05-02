import fs from "fs/promises";
import path from "path";
import { CliDeps } from "../types";

export async function handleGenStub(deps: CliDeps): Promise<void> {
  const { default: inq } = await import("inquirer");
  const { filePath } = await inq.prompt([
    { type: "input", name: "filePath", message: "采集结果 JSON 文件路径：" },
  ]);
  try {
    const { StubGenerator } = await import("../../utils/crawl-ops/stub-generator");
    const raw = await fs.readFile(filePath, "utf-8");
    const result = JSON.parse(raw);
    const gen = new StubGenerator();
    const { lang } = await inq.prompt([
      { type: "list", name: "lang", message: "选择语言：", choices: ["python", "javascript"] }
    ]);
    const stub = gen.generateWbiStub(result, lang);
    if (!stub) { console.log("⚠️ 未能生成桩代码（缺少 WBI 密钥）"); return; }
    const dir = path.dirname(filePath);
    const ext = lang === "python" ? "py" : "js";
    const stubPath = path.join(dir, `wbi-stub.${ext}`);
    const testPath = path.join(dir, `wbi-test.${ext}`);
    await fs.writeFile(stubPath, stub.code);
    await fs.writeFile(testPath, stub.testCode);
    console.log(`✅ 桩代码: ${stubPath}`);
    console.log(`✅ 测试文件: ${testPath}`);
  } catch (e) {
    deps.logger.error("生成桩代码失败", { err: (e as Error).message });
    console.log("❌ 生成失败:", (e as Error).message);
  }
}
