import fs from "fs";
import path from "path";

function main() {
  const dir = "output/www_bilibili_com";
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".json") && !f.includes("anti-crawl")).sort().reverse();
  if (files.length === 0) { console.log("无采集结果"); return; }

  const latest = files[0];
  console.log("最新文件:", latest);
  const data = JSON.parse(fs.readFileSync(path.join(dir, latest), "utf-8"));

  console.log("\n=== 基本信息 ===");
  console.log("URL:", data.targetUrl);
  console.log("耗时:", (data.finishedAt - data.startedAt) + "ms");
  console.log("请求总数:", data.networkRequests.length);
  console.log("页面元素:", data.elements.length);

  // 登录态
  const authCookies = data.storage.cookies.filter((c: any) =>
    ["SESSDATA", "sid", "bili_jct", "b_lsid"].some(k => c.name.includes(k))
  );
  console.log("\n=== 认证 Cookies (" + authCookies.length + "/" + data.storage.cookies.length + ") ===");
  authCookies.forEach((c: any) => console.log(" ", c.name, (c.value + "").slice(0, 25) + "...", c.domain));

  // API 端点
  const apis = data.analysis?.apiRequests || data.networkRequests.filter((r: any) => r.url.includes("api.bilibili.com"));
  console.log("\n=== 业务 API (" + apis.length + ") ===");
  const seen = new Set<string>();
  apis.forEach((r: any) => {
    const path = r.url.split("?")[0].replace("https://api.bilibili.com", "");
    const key = r.method + path;
    if (seen.has(key)) return;
    seen.add(key);
    console.log(" ", r.method, path, r.statusCode);
  });

  // 反爬
  try {
    const ac = JSON.parse(fs.readFileSync(path.join(dir, latest.replace(".json", "-anti-crawl.json")), "utf-8"));
    console.log("\n=== 反爬检测 (" + ac.length + ") ===");
    ac.forEach((item: any) => console.log(" ", item.category, item.severity));
  } catch { console.log("\n无反爬检测文件"); }

  // WBI
  try {
    const stub = fs.readFileSync(path.join(dir, latest.replace(".json", "-wbi-stub.py")), "utf-8");
    const imgKey = stub.match(/IMG_KEY = "([^"]+)"/);
    const subKey = stub.match(/SUB_KEY = "([^"]+)"/);
    console.log("\n=== WBI 签名桩 ===");
    console.log("  img_key:", imgKey ? imgKey[1].slice(0, 20) + "..." : "N/A");
    console.log("  sub_key:", subKey ? subKey[1].slice(0, 20) + "..." : "N/A");
    console.log("  桩代码长度:", stub.length, "字符");
  } catch { console.log("\n无 WBI 桩文件"); }

  // DataClassifier 分类摘要
  console.log("\n=== 分类摘要 ===");
  const authTokens = data.storage?.cookies?.filter((c: any) =>
    ["session", "token", "sid"].some(k => c.name.toLowerCase().includes(k))
  ) || [];
  console.log("  核心 API:", seen.size);
  console.log("  鉴权令牌:", authTokens.length);
  console.log("  全量请求:", data.networkRequests.length);
}

main();
