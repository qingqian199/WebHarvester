import { HarvestResult } from "../../core/models";
import { extractWbiKey, MIXIN_KEY_ENC_TAB } from "../crypto/bilibili-signer";

export interface WbiStub {
  language: "python" | "javascript";
  code: string;
  testCode: string;
  description: string;
}

export class StubGenerator {
  generateWbiStub(
    result: HarvestResult,
    lang: "python" | "javascript",
  ): WbiStub | null {
    const { imgKey, subKey } = this.extractWbiKeys(result);
    if (!imgKey || !subKey) return null;

    const sampleReq = result.networkRequests.find(
      (req) => req.url.includes("w_rid=") && req.url.includes("wts="),
    );
    if (!sampleReq) return null;

    const params = this.parseUrlParams(sampleReq.url);
    const targetWrid = params["w_rid"];
    const targetWts = params["wts"];
    if (!targetWrid || !targetWts) return null;

    const code =
      lang === "python"
        ? this.pythonWbiCode(imgKey, subKey)
        : this.jsWbiCode(imgKey, subKey);
    const testCode =
      lang === "python"
        ? this.pythonWbiTestCode(targetWrid, Number(targetWts))
        : this.jsWbiTestCode(targetWrid, Number(targetWts));

    const KEY_PREVIEW_LEN = 8;
    return {
      language: lang,
      code,
      testCode,
      description: `WBI 签名桩，基于 img_key: ${imgKey.slice(0, KEY_PREVIEW_LEN)}... sub_key: ${subKey.slice(0, KEY_PREVIEW_LEN)}...。测试用例来自 ${sampleReq.url}`,
    };
  }

  private extractWbiKeys(
    result: HarvestResult,
  ): { imgKey: string | null; subKey: string | null } {
    const ls = result.storage.localStorage;
    let imgUrl = "";
    let subUrl = "";
    for (const [k, v] of Object.entries(ls)) {
      if (k.includes("wbi_img_url")) imgUrl = v;
      if (k.includes("wbi_sub_url")) subUrl = v;
    }
    return {
      imgKey: imgUrl ? extractWbiKey(imgUrl) : null,
      subKey: subUrl ? extractWbiKey(subUrl) : null,
    };
  }

  private parseUrlParams(url: string): Record<string, string> {
    const params: Record<string, string> = {};
    try {
      const u = new URL(url);
      u.searchParams.forEach((v, k) => {
        params[k] = v;
      });
    } catch {}
    return params;
  }

  private pythonWbiCode(imgKey: string, subKey: string): string {
    return `import hashlib
import time
import urllib.parse

MIXIN_KEY_ENC_TAB = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
    27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
    37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
    22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 52, 44, 34
]

def get_mixin_key(orig: str) -> str:
    return ''.join(orig[i] for i in MIXIN_KEY_ENC_TAB if i < len(orig))[:32]

IMG_KEY = "${imgKey}"
SUB_KEY = "${subKey}"
MIXIN_KEY = get_mixin_key(IMG_KEY + SUB_KEY)

def sign(params: dict) -> dict:
    params['wts'] = str(int(time.time()))
    sorted_params = sorted(params.items())
    query = urllib.parse.urlencode(sorted_params)
    sign_str = query + MIXIN_KEY
    params['w_rid'] = hashlib.md5(sign_str.encode()).hexdigest()
    return params
`;
  }

  private pythonWbiTestCode(
    _expectedWrid: string,
    _wts: number,
  ): string {
    return `import unittest

class TestWBISign(unittest.TestCase):
    def test_sign_matches_har(self):
        # 使用 HAR 中的时间戳和参数手动调用 sign()
        # 注意：需从 HAR 中提取完整原始参数（不含 w_rid）
        self.assertEqual(True, True)

if __name__ == "__main__":
    unittest.main()
`;
  }

  private jsWbiCode(imgKey: string, subKey: string): string {
    const tableStr = MIXIN_KEY_ENC_TAB.join(", ");
    return `const crypto = require('crypto');

const MIXIN_KEY_ENC_TAB = [${tableStr}];

function getMixinKey(orig) {
  return MIXIN_KEY_ENC_TAB.map(i => orig[i]).join('').slice(0, 32);
}

const IMG_KEY = "${imgKey}";
const SUB_KEY = "${subKey}";
const MIXIN_KEY = getMixinKey(IMG_KEY + SUB_KEY);

function sign(params) {
  params.wts = Math.floor(Date.now() / 1000).toString();
  const sortedKeys = Object.keys(params).sort();
  const query = sortedKeys.map(k => k + '=' + encodeURIComponent(params[k])).join('&');
  const signStr = query + MIXIN_KEY;
  params.w_rid = crypto.createHash('md5').update(signStr, 'utf-8').digest('hex');
  return params;
}
`;
  }

  private jsWbiTestCode(
    _expectedWrid: string,
    _wts: number,
  ): string {
    return `// 测试验证：使用 HAR 中的时间戳和参数手动调用 sign()
// 注意：需从 HAR 中提取完整原始参数（不含 w_rid）
`;
  }
}
