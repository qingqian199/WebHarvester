/**
 * 采集结果页 — 结构化展示 + 操作快捷键
 */
import chalk from "chalk";

interface CrawlResult {
  unit?: string;
  status: string;
  responseTime?: number;
  error?: string;
  data?: any;
}

interface SiteCrawlResult {
  site: string;
  url: string;
  results: CrawlResult[];
  totalTime: number;
}

/**
 * 展示特化站点采集结果
 */
export function showCrawlResults(result: SiteCrawlResult): void {
  const { site, url, results, totalTime } = result;
  const successCount = results.filter((r) => r.status === "success").length;
  const partialCount = results.filter((r) => r.status === "partial").length;
  const failCount = results.filter((r) => r.status === "failed").length;

  console.log(chalk.bold(`\n━━━ ${site} 采集完成 ━━━`));
  console.log(`  URL: ${url}`);
  console.log(`  耗时: ${totalTime}ms | ✅${successCount} ⚠️${partialCount} ❌${failCount}`);

  for (const r of results) {
    if (r.status === "failed") {
      console.log(chalk.red(`  ❌ ${r.unit || ""}: ${r.error || "失败"}`));
      continue;
    }
    if (r.status === "partial") {
      console.log(chalk.yellow(`  ⚠️ ${r.unit || ""}: 部分数据`));
      continue;
    }

    const d = r.data as any;
    console.log(chalk.green(`  ✅ ${r.unit || ""} (${r.responseTime || 0}ms)`));

    // 按类型展示
    if (d.subject !== undefined) showPostDetail(d);
    else if (d.nickname !== undefined) showUserInfo(d);
    else if (d.code !== undefined && d.data?.replies) showComments(d);
    else if (d.code !== undefined && d.data?.title) showVideoInfo(d);
    else if (d.hot_search_queries) showHotSearch(d);
    else if (Array.isArray(d)) showArrayData(d, r.unit || "");
    else showGenericData(d);
  }
}

function showPostDetail(d: any): void {
  console.log(`   标题: ${chalk.white(d.subject)}`);
  if (d.stats) {
    const s = d.stats;
    console.log(`   统计: 👁${s.view || 0}  👍${s.like || 0}  💬${s.reply || 0}  ⭐${s.favorite || 0}  🔄${s.share || 0}`);
  }
  if (d.images?.length) console.log(`   图片: ${d.images.length} 张`);
  if (d.topics?.length) console.log(`   话题: ${d.topics.join(", ")}`);
  if (d.plainText) console.log(`   正文: ${d.plainText.slice(0, 200)}...`);
}

function showUserInfo(d: any): void {
  console.log(`   昵称: ${chalk.white(d.nickname)}  Lv${d.level || "?"}`);
  console.log(`   帖子: ${d.post_num || 0}  粉丝: ${d.followed_cnt || 0}  关注: ${d.follow_cnt || 0}`);
}

function showComments(d: any): void {
  const replies = d.data?.replies || [];
  console.log(`   评论: ${replies.length} 条`);
  replies.slice(0, 3).forEach((r: any, i: number) => {
    const name = r.member?.uname || r.author?.name || `#${i}`;
    const msg = (r.content?.message || r.content || "").slice(0, 60);
    console.log(`     ${i + 1}. ${chalk.cyan(name)}: ${msg}`);
  });
}

function showVideoInfo(d: any): void {
  const v = d.data?.View || d.data || {};
  console.log(`   标题: ${chalk.white(v.title || "")}`);
  console.log(`   UP主: ${v.owner?.name || ""}`);
  if (v.stat) {
    console.log(`   播放: 👁${v.stat.view || 0}  👍${v.stat.like || 0}  🪙${v.stat.coin || 0}  ⭐${v.stat.favorite || 0}  🔄${v.stat.share || 0}`);
  }
}

function showHotSearch(d: any): void {
  const list = d.hot_search_queries || [];
  console.log(`   热搜 ${list.length} 条:`);
  list.slice(0, 5).forEach((q: any, i: number) => {
    const hot = q.hot >= 10000 ? `${(q.hot / 10000).toFixed(1)}万` : q.hot;
    console.log(`     ${i + 1}. ${chalk.white(q.query || "")} 🔥${hot}`);
  });
}

function showArrayData(d: any[], label: string): void {
  console.log(`   ${label}: ${d.length} 条`);
  d.slice(0, 3).forEach((item, i) => {
    const text = item.subject || item.title || item.query || item.name || JSON.stringify(item).slice(0, 60);
    console.log(`     ${i + 1}. ${text}`);
  });
}

function showGenericData(d: any): void {
  const keys = Object.keys(d).slice(0, 5);
  for (const k of keys) {
    const v = typeof d[k] === "string" ? d[k].slice(0, 80) : JSON.stringify(d[k]).slice(0, 80);
    console.log(`   ${k}: ${v}`);
  }
}

/**
 * 展示 CDP/通用采集结果
 */
export function showGenericHarvestResult(result: any): void {
  console.log(chalk.bold("\n━━━ 通用采集结果 ━━━"));
  console.log(`  标题: ${chalk.white(result.title || "(空)")}`);
  console.log(`  文本长度: ${result.textLength || 0} 字${!result.textLength ? chalk.yellow(" ⚠️ SPA 页面，需 JS 渲染") : ""}`);
  console.log(`  网络请求: ${result.harCount || 0} 条`);
  if (result.apiEndpoints?.length > 0) {
    console.log(`  API 端点: ${result.apiEndpoints.length} 个`);
    result.apiEndpoints.slice(0, 6).forEach((ep: string) => console.log(`    ${ep.replace(/^https?:\/\//, "").slice(0, 80)}`));
  }
  if (result.apiContentItems) console.log(`  内容数据API: ${result.apiContentItems} 个`);
  if (result.cookies) console.log(`  Cookie: ${result.cookies} 个`);
  if (result.hasScreenshot) console.log("  截图: ✅");
  if (result.antiCrawlFindings?.length > 0) {
    console.log(`  🛡️ 反爬检测: ${result.antiCrawlFindings.join(", ")}`);
  } else {
    console.log("  🛡️ 反爬: 未检测到");
  }
  console.log(`  耗时: ${result.timing || 0}ms`);
  console.log(chalk.dim("  💡 SPA 页面可尝试: 快速采集 → 输入 URL → 自动匹配特化爬虫"));
}
