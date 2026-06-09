import { ISigner, SignerRegistry } from "./signer-registry";

class BilibiliWbiSigner implements ISigner {
  readonly name = "wbi";
  async sign(params: Record<string, unknown>): Promise<Record<string, string>> {
    const { buildSignedQuery } = await import("../utils/crypto/bilibili-signer");
    const { WbiKeyManager } = await import("./wbi-key-manager");
    const mgr = new WbiKeyManager();
    const { img_key, sub_key } = await mgr.getKeys();
    const paramStr: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) paramStr[k] = String(v);
    const signedQuery = buildSignedQuery(paramStr, img_key, sub_key);
    const result: Record<string, string> = {};
    for (const part of signedQuery.split("&")) {
      const [k, ...rest] = part.split("=");
      if (k) result[k] = decodeURIComponent(rest.join("="));
    }
    return result;
  }
}

class XhsSignerAdapter implements ISigner {
  readonly name = "x-s";
  async sign(params: Record<string, unknown>): Promise<Record<string, string>> {
    const { generateXsHeader } = await import("../utils/crypto/xhs-signer");
    const apiPath = String(params.apiPath || params.path || "/");
    const data = String(params.data || "{}");
    const cookies = params.cookies as Record<string, string> | undefined;
    return { ...generateXsHeader(apiPath, data, cookies) };
  }
}

class ZhihuSignerAdapter implements ISigner {
  readonly name = "zse-96";
  async sign(params: Record<string, unknown>): Promise<Record<string, string>> {
    const { generateZse96, generateApiVersion } = await import("../utils/crypto/zhihu-signer");
    const path = String(params.path || "");
    return { "x-zse-96": generateZse96(path), "x-api-version": generateApiVersion() };
  }
}

class MiyousheSignerAdapter implements ISigner {
  readonly name = "ds";
  async sign(params: Record<string, unknown>): Promise<Record<string, string>> {
    const { buildMiyousheHeaders } = await import("../utils/crypto/miyoushe-signer");
    const query = String(params.query || "");
    const body = params.body !== undefined ? String(params.body) : undefined;
    const deviceFp = params.deviceFp ? String(params.deviceFp) : undefined;
    return { ...buildMiyousheHeaders(query, body, deviceFp) };
  }
}

class DouyinSignerAdapter implements ISigner {
  readonly name = "a_bogus";
  async sign(params: Record<string, unknown>): Promise<Record<string, string>> {
    const { signDouyinRequest } = await import("../utils/crypto/douyin-signer");
    const url = String(params.url || "");
    const ua = params.userAgent ? String(params.userAgent) : undefined;
    const cookie = params.cookie ? String(params.cookie) : undefined;
    return signDouyinRequest(url, ua, cookie);
  }
}

class NoopSigner implements ISigner {
  readonly name = "none";
  async sign(_params: Record<string, unknown>): Promise<Record<string, string>> {
    return {};
  }
}

export function registerAllSigners(): void {
  SignerRegistry.register(new BilibiliWbiSigner(), "bilibili", "wbi");
  SignerRegistry.register(new XhsSignerAdapter(), "xiaohongshu", "xhs");
  SignerRegistry.register(new ZhihuSignerAdapter(), "zhihu");
  SignerRegistry.register(new MiyousheSignerAdapter(), "miyoushe", "mihoyo");
  SignerRegistry.register(new DouyinSignerAdapter(), "douyin");
  SignerRegistry.register(new NoopSigner(), "none");
}
