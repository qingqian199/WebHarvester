import fs from "fs";
import { XhsCrawler } from "../src/adapters/crawlers/XhsCrawler";
import { CrawlerSession } from "../src/core/ports/ISiteCrawler";

async function main() {
  const sessionRaw = fs.readFileSync("sessions/xiaohongshu.session.json", "utf-8");
  const sessionData = JSON.parse(sessionRaw);
  const session: CrawlerSession = {
    cookies: sessionData.cookies,
    localStorage: sessionData.localStorage,
  };
  const crawler = new XhsCrawler();

  const userIdHash = "69d845e10000000032025fea"; // 从 /v2/user/me 获取的加密 user_id
  const redId = "27756878113";                  // 从 /v2/user/me 获取的数字 red_id

  // 尝试从推荐页面获取有效 note_id
  // 小红书 note_id 格式: 64 开头 + 16 位十六进制，从笔记 URL 可提取
  const testNoteIds = [
    "6749d64c000000001f028c42",
    "66b1e4b2000000001a00a123",
    "672a3b9e000000002c00c456",
  ];

  interface TestCase {
    name: string;
    urls: string[];
    expectNotes?: boolean;
  }

  const testCases: TestCase[] = [
    // 用户帖子列表 - 不同 ID 格式
    {
      name: "用户帖子列表",
      urls: [
        `https://edith.xiaohongshu.com/api/sns/web/v1/user_posted?user_id=${userIdHash}&num=5`,
        `https://edith.xiaohongshu.com/api/sns/web/v1/user_posted?user_id=${redId}&num=5`,
        `https://edith.xiaohongshu.com/api/sns/web/v1/user_posted?red_id=${redId}&num=5`,
        `https://edith.xiaohongshu.com/api/sns/web/v1/user_posted?user_id=${userIdHash}&cursor=&num=5`,
      ],
    },
    // 笔记详情 - 不同 note_id
    {
      name: "笔记详情",
      urls: testNoteIds.flatMap((id) => [
        `https://edith.xiaohongshu.com/api/sns/web/v1/feed?note_id=${id}`,
        `https://edith.xiaohongshu.com/api/sns/web/v1/feed?source_note_id=${id}`,
        `https://edith.xiaohongshu.com/api/sns/web/v2/feed?note_id=${id}`,
      ]),
    },
    // 收藏列表
    {
      name: "收藏/专辑",
      urls: [
        `https://edith.xiaohongshu.com/api/sns/web/v1/board/user?user_id=${userIdHash}&num=5`,
        `https://edith.xiaohongshu.com/api/sns/web/v1/board/user?red_id=${redId}&num=5`,
      ],
    },
    // 用户信息（其他用户）
    {
      name: "其他用户信息",
      urls: [
        `https://edith.xiaohongshu.com/api/sns/web/v1/user/otherinfo?target_user_id=${userIdHash}`,
        `https://edith.xiaohongshu.com/api/sns/web/v1/user/otherinfo?user_id=${userIdHash}`,
        `https://edith.xiaohongshu.com/api/sns/web/v1/user/otherinfo?target_uid=${userIdHash}`,
      ],
    },
    // 关注列表
    {
      name: "关注/粉丝",
      urls: [
        `https://edith.xiaohongshu.com/api/sns/web/v2/user/following?user_id=${userIdHash}&num=5`,
        `https://edith.xiaohongshu.com/api/sns/web/v1/user/following?user_id=${userIdHash}&num=5`,
        `https://edith.xiaohongshu.com/api/sns/web/v2/user/follower?user_id=${userIdHash}&num=5`,
      ],
    },
  ];

  for (const tc of testCases) {
    console.log(`\n===== ${tc.name} =====`);
    for (const url of tc.urls) {
      process.stdout.write(`  ${new URL(url).search}... `);
      try {
        const result = await crawler.fetch(url, session);
        let code = -1, msg = "", preview = "";
        if (result.headers["content-type"]?.includes("json")) {
          const body = JSON.parse(result.body);
          code = body.code ?? -1;
          msg = body.msg ?? body.message ?? "";
          const d = body.data ?? {};
          if (code === 0) {
            if (d.items) preview = `items:${d.items.length}`;
            else if (d.notes) preview = `notes:${d.notes.length}`;
            else if (d.boards) preview = `boards:${d.boards.length}`;
            else preview = Object.keys(d).slice(0, 4).join(",");
          } else {
            preview = JSON.stringify(body).slice(0, 100);
          }
        } else {
          preview = `非JSON(${result.statusCode})`;
        }
        const icon = code === 0 ? "✅" : "❌";
        console.log(` ${icon} code=${code} ${msg} (${result.responseTime}ms) → ${preview}`);
      } catch (e: any) {
        console.log(` ❌ 异常: ${e.message}`);
      }
    }
  }
}

main().catch(console.error);
