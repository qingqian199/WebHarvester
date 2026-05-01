import fs from "fs/promises";
import path from "path";
import { HarvestResult } from "../core/models";
import { StubGenerator } from "../utils/crawl-ops/stub-generator";
import { ZhihuStubGenerator } from "../utils/crawl-ops/zhihu-stub-generator";
import { BilibiliStubGenerator } from "../utils/crawl-ops/bilibili-stub-generator";

function parseArgs() {
  const args = process.argv.slice(2);
  let filePath = "";
  let lang: "python" | "javascript" = "python";
  let site = "auto";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--site") site = args[++i] || "auto";
    else if (args[i] === "--lang" || args[i] === "--js") {
      lang = args[i] === "--js" || args[++i] === "js" ? "javascript" : "python";
    } else if (!args[i].startsWith("--")) {
      filePath = args[i];
    }
  }
  return { filePath, lang, site };
}

(async () => {
  const { filePath, lang, site } = parseArgs();

  if (site === "zhihu") {
    const gen = new ZhihuStubGenerator();
    const stub = gen.generateZse96Stub(lang);
    const dir = process.cwd();
    const ext = lang === "python" ? "py" : "js";
    await fs.writeFile(path.join(dir, `zhihu-signer.${ext}`), stub.code);
    await fs.writeFile(path.join(dir, `zhihu-signer-test.${ext}`), stub.testCode);
    console.log(`✅ 知乎 x-zse-96 签名桩: zhihu-signer.${ext}`);
    console.log(`✅ 测试文件: zhihu-signer-test.${ext}`);
    console.log(`📝 ${stub.description}`);
    return;
  }

  if (site === "bilibili") {
    const gen = new BilibiliStubGenerator();
    const stub = gen.generateWbiStub("7cd084941338484aae1ad9425b84077", "4932caff0ff746eab6f01bf08b70ac4", lang);
    const dir = process.cwd();
    const ext = lang === "python" ? "py" : "js";
    await fs.writeFile(path.join(dir, `bilibili-signer.${ext}`), stub.code);
    await fs.writeFile(path.join(dir, `bilibili-signer-test.${ext}`), stub.testCode);
    console.log(`✅ B站 WBI 签名桩: bilibili-signer.${ext}`);
    console.log(`📝 ${stub.description}`);
    return;
  }

  // 默认/自动：从采集结果提取
  if (!filePath) {
    console.error("用法:");
    console.error("  npm run gen-stub -- --site zhihu                   生成知乎签名桩");
    console.error("  npm run gen-stub -- --site bilibili               生成B站签名桩");
    console.error("  npm run gen-stub <harvest-xxx.json> [--lang py|js] 从采集结果生成WBI签名");
    process.exit(1);
  }

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
    console.log("⚠️ 未能找到 WBI 签名密钥，请确认采集结果包含 localStorage 中的 wbi_img_url/wbi_sub_url");
  }
})().catch((e) => {
  console.error(`❌ 处理失败: ${(e as Error).message}`);
  process.exit(1);
});
