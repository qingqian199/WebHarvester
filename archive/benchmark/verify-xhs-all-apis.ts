import fs from "fs";
import { XhsCrawler } from "../src/adapters/crawlers/XhsCrawler";
import { CrawlerSession } from "../src/core/ports/ISiteCrawler";

interface TestCase {
  name: string;
  url: string;
  method: string;
  body?: string;
}

const cases: TestCase[] = [
  {
    name: "用户信息（/v1/user/otherinfo）",
    url: "https://edith.xiaohongshu.com/api/sns/web/v1/user/otherinfo?target_user_id=69d845e10000000032025fea",
    method: "GET",
  },
  {
    name: "用户信息（/v2/user/me）",
    url: "https://edith.xiaohongshu.com/api/sns/web/v2/user/me",
    method: "GET",
  },
  {
    name: "搜索笔记（POST /v1/search/notes）",
    url: "https://edith.xiaohongshu.com/api/sns/web/v1/search/notes",
    method: "POST",
    body: JSON.stringify({ keyword: "原神", page: 1, page_size: 5, sort: "general" }),
  },
  {
    name: "搜索推荐（GET /v1/search/recommend）",
    url: "https://edith.xiaohongshu.com/api/sns/web/v1/search/recommend?keyword=%E5%8E%9F%E7%A5%9E",
    method: "GET",
  },
  {
    name: "笔记详情（GET /v1/feed）",
    url: "https://edith.xiaohongshu.com/api/sns/web/v1/feed?note_id=6749d64c000000001f028c42",
    method: "GET",
  },
  {
    name: "用户帖子列表（/v1/user_posted）",
    url: "https://edith.xiaohongshu.com/api/sns/web/v1/user_posted?user_id=69d845e10000000032025fea&num=5",
    method: "GET",
  },
  {
    name: "笔记收藏（/v1/board/user）",
    url: "https://edith.xiaohongshu.com/api/sns/web/v1/board/user?user_id=69d845e10000000032025fea&num=3",
    method: "GET",
  },
  {
    name: "首页推荐（GET /api/sns/web/v1/feed）",
    url: "https://edith.xiaohongshu.com/api/sns/web/v1/feed?category_id=homefeed_recommend&num=3",
    method: "GET",
  },
];

async function main() {
  const sessionRaw = fs.readFileSync("sessions/xiaohongshu.session.json", "utf-8");
  const sessionData = JSON.parse(sessionRaw);
  const session: CrawlerSession = {
    cookies: sessionData.cookies,
    localStorage: sessionData.localStorage,
  };

  const crawler = new XhsCrawler();
  const results: Array<{ name: string; code: number; msg: string; cost: number; preview: string; ok: boolean }> = [];

  for (const tc of cases) {
    process.stdout.write(`⏳ ${tc.name}... `);
    try {
      const start = Date.now();
      const result = await crawler.fetch(tc.url, session, { method: tc.method, body: tc.body });
      const cost = Date.now() - start;

      let code = -1;
      let msg = "";
      let preview = "";
      let ok = false;

      if (result.headers["content-type"]?.includes("json")) {
        const body = JSON.parse(result.body);
        code = body.code ?? body.code_num ?? -1;
        msg = body.msg ?? body.message ?? "";

        if (code === 0) {
          ok = true;
          const data = body.data ?? body;
          if (data?.items?.length > 0) {
            preview = JSON.stringify(data.items[0]).slice(0, 120);
          } else if (data?.notes?.length > 0) {
            preview = JSON.stringify(data.notes[0]).slice(0, 120);
          } else if (data?.user_id || data?.red_id) {
            preview = `user: ${data.red_id ?? data.user_id}`;
          } else {
            preview = JSON.stringify(data).slice(0, 120);
          }
        } else {
          preview = JSON.stringify(body).slice(0, 200);
        }
      } else {
        msg = "非 JSON 响应";
        preview = result.body.slice(0, 200);
      }

      results.push({ name: tc.name, code, msg, cost, preview, ok });
      console.log(ok ? "✅" : "❌", code, msg);
    } catch (e: any) {
      results.push({ name: tc.name, code: -999, msg: e.message, cost: 0, preview: "", ok: false });
      console.log("❌ 异常:", e.message);
    }
  }

  console.log("\n");
  console.log("=".repeat(100));
  console.log("  XhsCrawler Phase 2 签名 — 端点验证总结");
  console.log("=".repeat(100));
  console.log("");
  console.log("  #  端点".padEnd(50), "code".padEnd(8), "耗时".padEnd(8), "状态");
  console.log("  " + "-".repeat(96));
  results.forEach((r, i) => {
    const name = `${i + 1}. ${r.name}`.padEnd(50);
    const code = String(r.code).padEnd(8);
    const cost = `${r.cost}ms`.padEnd(8);
    const status = r.ok ? "✅" : r.code === -100 ? "⏳ 登录过期" : "❌";
    console.log(`  ${name}${code}${cost}${status}`);
  });
  console.log("\n  ✅ = Phase 2 签名有效，接口正常");
  console.log("  ⏳ = 签名有效但需登录或参数调整");
  console.log("  ❌ = 签名可能有问题");
  console.log("");

  // 详细信息
  console.log("=".repeat(100));
  console.log("  详细信息");
  console.log("=".repeat(100));
  results.forEach((r, i) => {
    console.log(`\n  [${i + 1}] ${r.name}`);
    console.log(`      code: ${r.code} | msg: ${r.msg} | 耗时: ${r.cost}ms`);
    if (r.preview) console.log(`      预览: ${r.preview.slice(0, 200)}`);
  });
}

main().catch(console.error);
