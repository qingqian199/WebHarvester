import fs from "fs";

function main() {
  const data = JSON.parse(fs.readFileSync("output/bilibili/combined-1777608458139.json", "utf-8"));

  console.log("=== 组合采集结果分析 ===\n");

  for (const r of data) {
    const icon = r.status === "success" ? "✅" : r.status === "partial" ? "⚠️" : "❌";
    const methodIcon = r.method === "signature" ? "🔵 签名直连" : "🟠 页面提取";
    console.log(`${icon} ${r.unit}`);
    console.log(`    方式: ${methodIcon} | 耗时: ${r.responseTime}ms`);
    if (r.error) console.log(`    错误: ${r.error}`);

    if (r.data) {
      // 视频信息 (signature)
      if (r.data.code === 0 && r.data.data?.View) {
        const v = r.data.data.View;
        console.log(`    标题: ${v.title}`);
        console.log(`    UP主: ${v.owner?.name} (mid: ${v.owner?.mid})`);
        console.log(`    播放: ${v.stat?.view} | 弹幕: ${v.stat?.danmaku} | 点赞: ${v.stat?.like}`);
        console.log(`    封面: ${v.pic}`);
      }
      // 页面提取
      if (r.data.title) {
        console.log(`    页面标题: ${r.data.title}`);
      }
    }
    console.log("");
  }

  const sig = data.filter((r: any) => r.method === "signature");
  const html = data.filter((r: any) => r.method === "html_extract");
  const avg = (arr: any[], key: string) => Math.round(arr.reduce((a: number, r: any) => a + r[key], 0) / arr.length);
  console.log("=== 摘要 ===");
  console.log(`签名直连: ${sig.length} 个 (平均 ${avg(sig, "responseTime")}ms)`);
  console.log(`页面提取: ${html.length} 个 (平均 ${avg(html, "responseTime")}ms)`);
  console.log(`成功: ${data.filter((r: any) => r.status === "success").length}/${data.length}`);
}

main();
