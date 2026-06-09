import { XhsCrawler, XhsApiEndpoints, XhsFallbackEndpoints } from "../src/adapters/crawlers/XhsCrawler";

console.log("=== XhsApiEndpoints ===");
XhsApiEndpoints.forEach(e => {
  const icon = e.status === "verified" ? "✅" : e.status === "risk_ctrl" ? "⛔" : "🔶";
  console.log(`  ${icon} ${e.name} (${e.path})`);
});

console.log("\n=== XhsFallbackEndpoints ===");
XhsFallbackEndpoints.forEach(e => {
  console.log(`  🟠 ${e.name}`);
  console.log(`     URL: ${e.pageUrl}`);
  console.log(`     dataPath: ${e.dataPath}`);
});

// verify fetchPageData method exists
const crawler = new XhsCrawler();
console.log("\n=== fetchPageData 方法存在性 ===");
console.log(typeof (crawler as any).fetchPageData === "function" ? "✅ fetchPageData 已实现" : "❌ 缺失");

console.log("\n=== 测试 __INITIAL_STATE__ 提取脚本 ===");
const mockScript = `
window.__INITIAL_STATE__ = {
  "search": {
    "notes": [
      { "id": "note1", "title": "测试笔记1" },
      { "id": "note2", "title": "测试笔记2" }
    ]
  },
  "user": {
    "userInfo": {
      "nickname": "测试用户",
      "desc": "个人简介"
    }
  },
  "note": {
    "noteDetailMap": {
      "note1": { "title": "笔记标题", "content": "笔记正文" }
    }
  }
};
`;
// 解析
const match = mockScript.match(/window\.__INITIAL_STATE__\s*=\s*({.*?});/s);
if (match) {
  const state = JSON.parse(match[1]);
  const notes = state.search?.notes;
  console.log("search.notes:", notes?.length === 2 ? "✅" : "❌", JSON.stringify(notes));
  const userInfo = state.user?.userInfo;
  console.log("user.userInfo:", userInfo?.nickname === "测试用户" ? "✅" : "❌", userInfo?.nickname);
  const detail = state.note?.noteDetailMap;
  console.log("note.noteDetailMap:", detail?.note1?.title === "笔记标题" ? "✅" : "❌", detail?.note1?.title);
}
