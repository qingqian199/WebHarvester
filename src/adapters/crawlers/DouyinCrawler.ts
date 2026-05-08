import { CrawlerSession } from "../../core/ports/ISiteCrawler";
import { IProxyProvider } from "../../core/ports/IProxyProvider";
import { UnitResult } from "../../core/models/ContentUnit";
import { BaseCrawler } from "./BaseCrawler";
import { resolveDouyinUrl } from "../../utils/url-resolver";

const DY_DOMAIN = "douyin.com";

/** 在浏览器 evaluate 中执行的 API 调用（利用页面 SDK 的 a_bogus 签名）。 */
function buildFetchScript(url: string): string {
  const safeUrl = url.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\${/g, "\\${");
  return `(async()=>{try{var r=await fetch(\`${safeUrl}\`);var d=await r.json();return JSON.stringify({ok:!!1,comments:d.comments||[],has_more:d.has_more||0,cursor:d.cursor||"0",total:d.total||0})}catch(e){return JSON.stringify({ok:!!1,error:""+(e.message||e)})}})()`;
}

export class DouyinCrawler extends BaseCrawler {
  readonly name = "douyin";
  readonly domain = DY_DOMAIN;

  constructor(proxyProvider?: IProxyProvider) { super("douyin", proxyProvider); this.registerCommentHandlers(); }

  matches(url: string): boolean {
    try { return new URL(url).hostname.includes(DY_DOMAIN); } catch { return false; }
  }

  protected getReferer(_url: string): string {
    return "https://www.douyin.com/";
  }

  private registerCommentHandlers(): void {
    // ── 视频评论（浏览器内直连翻页，同一会话内可选展开子回复） ──
    this.unitHandlers.set("douyin_video_comments", async (unit, params, session) => {
      const awemeId = params.aweme_id || params.modal_id || "";
      if (!awemeId) return { unit, status: "failed", data: null, method: "none", error: "缺少 aweme_id / modal_id", responseTime: 0 };

      const maxPages = Math.min(parseInt(params.max_pages || "20"), 200);
      const collectSubReplies = params.collect_sub_replies === "true" || params.collect_sub_replies === "1";
      const maxSubPages = Math.min(parseInt(params.max_sub_reply_pages || "5"), 50);
      const { browser, startTime } = await this.openVideoPage(awemeId, session);
      try {
        // ── 阶段1：采集主评论 ──
        const allComments: any[] = [];
        let cursor = "0";
        let hasMore = true;
        let pageNum = 0;

        while (hasMore && pageNum < maxPages) {
          const url = `https://www.douyin.com/aweme/v1/web/comment/list/?aweme_id=${awemeId}&cursor=${cursor}&count=20`;
          const raw = await browser.executeScript<string>(buildFetchScript(url))
            .catch((e: any) => JSON.stringify({ ok: false, error: e.message }));
          const data = JSON.parse(raw);
          if (!data.ok) {
            this.logger.warn(`评论第 ${pageNum + 1} 页获取失败: ${data.error}`);
            break;
          }
          if (data.comments.length === 0) { break; }

          for (const c of data.comments) {
            const initialSubs = Array.isArray(c.reply_comment) ? c.reply_comment : [];
            allComments.push({
              ...c,
              _subReplyCount: c.reply_comment_total || 0,
              _initialSubReplies: initialSubs,
            });
          }

          hasMore = data.has_more === 1;
          cursor = data.cursor || "0";
          pageNum++;
          if (pageNum % 5 === 0) this.logger.info(`  评论第 ${pageNum} 页: 累计 ${allComments.length} 条`);
          await new Promise((r) => setTimeout(r, 300 + Math.random() * 500));
        }

        this.logger.info(`✅ 评论完成: ${allComments.length} 条`);

        // ── 阶段2：同一浏览器会话内展开子回复（仅在有 collect_sub_replies 参数时） ──
        const subRepliesByCid: Record<string, { replies: any[]; total: number; unfetched?: number }> = {};
        let totalSubReplies = 0;

        if (collectSubReplies && allComments.length > 0) {
          const candidates = allComments.filter((c) => (c._subReplyCount || 0) > 0).slice(0, 50);
          this.logger.info(`  展开子回复: ${candidates.length} 条评论有回复`);

          for (let i = 0; i < candidates.length; i++) {
            const c = candidates[i];
            const cid = String(c.cid || "");
            if (!cid) continue;

            // 使用 XHR 调用子回复 API（绕过页面 fetch 拦截器可能挂起的问题）
            const replies: any[] = [...(c._initialSubReplies || [])];
            let sCursor = "0";
            let sHasMore = true;
            let sPages = 0;
            let subApiFailed = false;

            while (sHasMore && sPages < maxSubPages && !subApiFailed) {
              const sUrl = `https://www.douyin.com/aweme/v1/web/comment/list/reply/?item_id=${awemeId}&comment_id=${cid}&cursor=${sCursor}&count=20`;
              const raw = await new Promise<string>((_resolve) => {
                browser.executeScript<string>(`(function(){var x=new XMLHttpRequest();x.open("GET","${sUrl}",true);x.withCredentials=true;var t=setTimeout(function(){x.abort();resolve(JSON.stringify({ok:!!1,error:"timeout"}))},6000);x.onload=function(){clearTimeout(t);try{var d=JSON.parse(x.responseText);resolve(JSON.stringify({ok:!!1,comments:d.comments||[],has_more:d.has_more||0,cursor:d.cursor||"0"}))}catch(e){resolve(JSON.stringify({ok:!!1,error:"parse:"+x.responseText.slice(0,100)}))}};x.onerror=function(){clearTimeout(t);resolve(JSON.stringify({ok:!!1,error:"network"}))};x.send()})())`)
                  .catch((e: any) => JSON.stringify({ ok: false, error: e.message }))
                  .then((r) => r);
              });

              const data = JSON.parse(raw);
              if (!data.ok || data.error) {
                if (data.error === "timeout" || data.error === "network") {
                  subApiFailed = true;
                }
                break;
              }
              if (data.comments.length === 0) break;

              for (const sr of data.comments) {
                if (!replies.some((r: any) => r.cid === sr.cid)) replies.push(sr);
              }
              sHasMore = data.has_more === 1;
              sCursor = data.cursor || "0";
              sPages++;
            }

            if (replies.length > 0) {
              subRepliesByCid[cid] = {
                replies,
                total: replies.length,
                ...(subApiFailed && c._subReplyCount > replies.length ? { unfetched: c._subReplyCount - replies.length } : {}),
              };
              totalSubReplies += replies.length;
            }

            if ((i + 1) % 10 === 0 || subApiFailed) {
              const extra = subApiFailed ? " (API 翻页超时，仅返回初始嵌入的数据)" : "";
              this.logger.info(`  子回复进度: ${i + 1}/${candidates.length}, 累计 ${totalSubReplies} 条${extra}`);
            }
            await new Promise((r) => setTimeout(r, 100 + Math.floor(Math.random() * 200)));
          }
          this.logger.info(`✅ 子回复展开完成: ${Object.keys(subRepliesByCid).length} 条评论, 共 ${totalSubReplies} 条子回复`);
        }

        return {
          unit, status: "success",
          data: {
            code: 0,
            data: {
              comments: allComments,
              total: allComments.length,
              sub_replies: subRepliesByCid,
              total_sub_replies: totalSubReplies,
            },
          },
          method: "browser_fetch", responseTime: Date.now() - startTime,
        };
      } finally {
        await browser.close();
      }
    });
  }

  /** 打开视频页面并等待内容加载。 */
  private async openVideoPage(awemeId: string, session?: CrawlerSession): Promise<{ browser: import("../PlaywrightAdapter").PlaywrightAdapter; startTime: number }> {
    const url = `https://www.douyin.com/video/${awemeId}`;
    return this.fetchPageContent(url, session, ".douyin.com", "[class*=\"comment\"]");
  }

  async collectUnits(units: string[], params: Record<string, string>, session?: CrawlerSession, _authMode?: string): Promise<UnitResult<unknown>[]> {
    if (params.url) {
      const resolved = resolveDouyinUrl(params.url);
      for (const [k, v] of Object.entries(resolved)) {
        if (!params[k]) params[k] = v;
      }
    }

    // 如果同时勾选了评论 + 子回复，合并为一次调用
    const hasComments = units.includes("douyin_video_comments");
    const hasSubReplies = units.includes("douyin_video_sub_replies");
    let mergedUnits: string[];

    if (hasComments && hasSubReplies) {
      mergedUnits = ["douyin_video_comments"];
      params.collect_sub_replies = "true";
    } else {
      mergedUnits = units;
    }

    const results: UnitResult[] = [];
    for (const unit of mergedUnits) {
      const start = Date.now();
      try {
        const r = await this.dispatchUnit(unit, params, session, undefined, results);
        results.push(r);
      } catch (e: unknown) {
        results.push({ unit, status: "failed", data: null, method: "none", error: e instanceof Error ? e.message : String(e), responseTime: Date.now() - start });
      }
    }
    return results;
  }
}
