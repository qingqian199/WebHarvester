/** 站点支持的内容单元定义。 */
const SITE_UNIT_DEFS: Record<string, string[]> = {
  xiaohongshu: ["user_info", "user_posts", "note_detail", "search_notes", "note_comments", "note_sub_replies"],
  zhihu: ["zhihu_user_info", "zhihu_search", "zhihu_article", "zhihu_hot_search", "zhihu_comments", "zhihu_sub_replies"],
  bilibili: ["bili_video_info", "bili_search", "bili_user_videos", "bili_video_comments", "bili_video_sub_replies"],
  tiktok: ["tt_feed", "tt_video_detail", "tt_user_info", "tt_video_comments", "tt_user_videos", "tt_search", "tt_trending"],
  douyin: ["douyin_video_comments", "douyin_video_sub_replies"],
  baidu_scholar: ["scholar_search", "scholar_paper_detail"],
  miyoushe: ["miyoushe_post_detail", "miyoushe_user_info", "miyoushe_post_comments", "miyoushe_search_posts"],
};

// ── Types ──

export interface UnitStats {
  unit: string;
  callCount: number;
  lastCalledAt: number | null;
  successCount: number;
  failCount: number;
  avgResponseTime: number;
}

export interface DomainProfile {
  domain: string;
  availableUnits: string[];
  unitStats: UnitStats[];
  totalCalls: number;
  unusedUnits: string[];
  highFailRateUnits: string[];
}

// ── CrawlerProfiler ──

export class CrawlerProfiler {
  private unitCounters = new Map<string, { callCount: number; successCount: number; failCount: number; totalTime: number; lastCalledAt: number | null }>();

  /** 记录一个单元的调用结果。 */
  recordUnitCall(unit: string, success: boolean, responseTime: number, domain: string): void {
    const key = `${domain}:${unit}`;
    const prev = this.unitCounters.get(key) ?? { callCount: 0, successCount: 0, failCount: 0, totalTime: 0, lastCalledAt: null };
    prev.callCount++;
    if (success) prev.successCount++;
    else prev.failCount++;
    prev.totalTime += responseTime;
    prev.lastCalledAt = Date.now();
    this.unitCounters.set(key, prev);
  }

  /** 获取某个域名的完整功能调用档案。 */
  getDomainProfile(domain: string): DomainProfile {
    const availableUnits = SITE_UNIT_DEFS[domain] ?? [];
    const unitStats: UnitStats[] = [];
    let totalCalls = 0;

    for (const unit of availableUnits) {
      const key = `${domain}:${unit}`;
      const counter = this.unitCounters.get(key);
      const stats: UnitStats = {
        unit,
        callCount: counter?.callCount ?? 0,
        lastCalledAt: counter?.lastCalledAt ?? null,
        successCount: counter?.successCount ?? 0,
        failCount: counter?.failCount ?? 0,
        avgResponseTime: counter && counter.callCount > 0 ? Math.round(counter.totalTime / counter.callCount) : 0,
      };
      totalCalls += stats.callCount;
      unitStats.push(stats);
    }

    const unusedUnits = unitStats.filter((s) => s.callCount === 0).map((s) => s.unit);
    const highFailRateUnits = unitStats
      .filter((s) => s.callCount > 0 && s.failCount / s.callCount > 0.5)
      .map((s) => s.unit);

    return { domain, availableUnits, unitStats, totalCalls, unusedUnits, highFailRateUnits };
  }

  /** 获取所有已注册域名的档案。 */
  getAllDomainProfiles(): DomainProfile[] {
    const domains = new Set<string>();
    for (const key of this.unitCounters.keys()) {
      domains.add(key.split(":")[0]);
    }
    return Array.from(domains).map((d) => this.getDomainProfile(d));
  }

  /** 重置所有计数器。 */
  reset(): void {
    this.unitCounters.clear();
  }
}

// ── Singleton ──

let _instance: CrawlerProfiler | null = null;

export function getCrawlerProfiler(): CrawlerProfiler {
  if (!_instance) _instance = new CrawlerProfiler();
  return _instance;
}
