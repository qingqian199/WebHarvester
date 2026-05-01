export interface ZhihuStub {
  language: "python" | "javascript";
  code: string;
  testCode: string;
  description: string;
}

export class ZhihuStubGenerator {
  generateZse96Stub(lang: "python" | "javascript"): ZhihuStub {
    return {
      language: lang,
      code: lang === "python" ? this.pythonCode() : this.jsCode(),
      testCode: lang === "python" ? this.pythonTest() : this.jsTest(),
      description: "知乎 x-zse-96 签名桩。基于 MD5 + Base64 算法，对 API 路径 + 查询参数签名。",
    };
  }

  private pythonCode(): string {
    return [
      "import hashlib",
      "import base64",
      "",
      "def generate_zse96(path: str, params: str = \"\") -> str:",
      "    \"\"\"",
      "    生成知乎 API 请求所需的 x-zse-96 签名头。",
      "",
      "    参数:",
      "        path: API 路径，如 \"/api/v4/me\"",
      "        params: 查询参数字符串，如 \"include=email\"",
      "",
      "    返回:",
      "        x-zse-96 签名字符串，格式 \"2.0_<base64>\"",
      "    \"\"\"",
      "    sign_str = f\"{path}?{params}\" if params else path",
      "    md5_hash = hashlib.md5(sign_str.encode(\"utf-8\")).hexdigest()",
      "    b64 = base64.b64encode(bytes.fromhex(md5_hash)).decode(\"utf-8\")",
      "    return f\"2.0_{b64}\"",
      "",
      "def generate_api_version() -> str:",
      "    \"\"\"生成 x-api-version 头。\"\"\"",
      "    return \"3.0.40\"",
    ].join("\n");
  }

  private pythonTest(): string {
    return `import unittest

class TestZse96(unittest.TestCase):
    def test_generate_zse96(self):
        sig = generate_zse96("/api/v4/me", "include=email")
        self.assertTrue(sig.startswith("2.0_"))
        self.assertEqual(len(sig), 50)

    def test_generate_zse96_no_params(self):
        sig = generate_zse96("/api/v4/me")
        self.assertTrue(sig.startswith("2.0_"))

    def test_api_version(self):
        self.assertEqual(len(generate_api_version().split(".")), 3)

if __name__ == "__main__":
    unittest.main()
`;
  }

  private jsCode(): string {
    return `const crypto = require("crypto");

function generateZse96(path, params = "") {
  const signStr = params ? \`\${path}?\${params}\` : path;
  const md5 = crypto.createHash("md5").update(signStr, "utf-8").digest("hex");
  const b64 = Buffer.from(md5, "hex").toString("base64");
  return \`2.0_\${b64}\`;
}

function generateApiVersion() {
  return "3.0.40";
}

module.exports = { generateZse96, generateApiVersion };
`;
  }

  private jsTest(): string {
    return `const { generateZse96, generateApiVersion } = require("./zhihu-signer");

console.log("x-zse-96:", generateZse96("/api/v4/me", "include=email"));
console.log("version:", generateApiVersion());
`;
  }
}
