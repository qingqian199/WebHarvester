export interface BiliStub {
  language: "python" | "javascript";
  code: string;
  testCode: string;
  description: string;
}

const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
  27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
  37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
  22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
];

export class BilibiliStubGenerator {
  generateWbiStub(imgKey: string, subKey: string, lang: "python" | "javascript"): BiliStub {
    return {
      language: lang,
      code: lang === "python" ? this.pythonCode(imgKey, subKey) : this.jsCode(imgKey, subKey),
      testCode: lang === "python" ? this.pythonTest() : this.jsTest(),
      description: `B站 WBI 签名桩，基于 img_key=${imgKey.slice(0, 8)}... sub_key=${subKey.slice(0, 8)}...`,
    };
  }

  private pythonCode(imgKey: string, subKey: string): string {
    return `import hashlib
import time
import urllib.parse

MIXIN_KEY_ENC_TAB = ${JSON.stringify(MIXIN_KEY_ENC_TAB)}

def get_mixin_key(orig: str) -> str:
    return "".join(orig[i] for i in MIXIN_KEY_ENC_TAB if i < len(orig))[:32]

IMG_KEY = "${imgKey}"
SUB_KEY = "${subKey}"
MIXIN_KEY = get_mixin_key(IMG_KEY + SUB_KEY)

def sign(params: dict) -> dict:
    params["wts"] = str(int(time.time()))
    sorted_params = sorted(params.items())
    query = urllib.parse.urlencode(sorted_params)
    sign_str = query + MIXIN_KEY
    params["w_rid"] = hashlib.md5(sign_str.encode()).hexdigest()
    return params
`;
  }

  private pythonTest(): string {
    return `import unittest

class TestWbiSign(unittest.TestCase):
    def test_sign_produces_wrid_and_wts(self):
        result = sign({"aid": "123"})
        self.assertIn("w_rid", result)
        self.assertIn("wts", result)
        self.assertEqual(len(result["w_rid"]), 32)

if __name__ == "__main__":
    unittest.main()
`;
  }

  private jsCode(imgKey: string, subKey: string): string {
    return `const crypto = require("crypto");

const MIXIN_KEY_ENC_TAB = ${JSON.stringify(MIXIN_KEY_ENC_TAB)};

function getMixinKey(orig) {
  return MIXIN_KEY_ENC_TAB.map(i => orig[i]).join("").slice(0, 32);
}

const IMG_KEY = "${imgKey}";
const SUB_KEY = "${subKey}";
const MIXIN_KEY = getMixinKey(IMG_KEY + SUB_KEY);

function sign(params) {
  params.wts = Math.floor(Date.now() / 1000).toString();
  const sortedKeys = Object.keys(params).sort();
  const query = sortedKeys.map(k => k + "=" + encodeURIComponent(params[k])).join("&");
  const signStr = query + MIXIN_KEY;
  params.w_rid = crypto.createHash("md5").update(signStr).digest("hex");
  return params;
}

module.exports = { sign };
`;
  }

  private jsTest(): string {
    return `const { sign } = require("./wbi-signer");
const result = sign({ aid: "123" });
console.log("w_rid:", result.w_rid);
console.log("wts:", result.wts);
`;
  }
}
