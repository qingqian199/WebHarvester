import fs from "fs/promises";
import path from "path";
import { HarvestResult } from "../core/models";
import { StubGenerator } from "../utils/crawl-ops/stub-generator";

(async () => {
  const filePath = process.argv[2];
  const lang = (process.argv[3] === "js" ? "javascript" : "python") as
    | "python"
    | "javascript";

  if (!filePath) {
    console.error("用法: npm run gen-stub <harvest-xxx.json> [js|python]");
    process.exit(1);
  }

  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const result: HarvestResult = JSON.parse(raw);
    const gen = new StubGenerator();
    const stub = gen.generateWbiStub(result, lang);

    if (stub) {
      const dir = path.dirname(filePath);
      const ext = lang === "python" ? "py" : "js";
      const stubPath = path.join(dir, `wbi-stub.${ext}`);
      const testPath = path.join(dir, `wbi-test.${ext}`);

      await fs.writeFile(stubPath, stub.code);
      await fs.writeFile(testPath, stub.testCode);
      console.log(`✅ 桩代码: ${stubPath}`);
      console.log(`✅ 测试文件: ${testPath}`);
      console.log(`📝 ${stub.description}`);
    } else {
      console.log("⚠️ 未能找到 WBI 签名所需的密钥或测试用例，请确认采集结果包含 localStorage 中的 wbi_img_url/wbi_sub_url");
    }
  } catch (e) {
    console.error(`❌ 处理失败: ${(e as Error).message}`);
    process.exit(1);
  }
})();
