import { describe, it, expect, beforeEach } from "@jest/globals";
import { TaskMonitor, getTimeline, listTimelines, clearTimelines } from "../task-monitor";
import { classifyError, classifyWithSuggestion, getSuggestion } from "../../utils/error-classifier";
import { CrawlerProfiler, getCrawlerProfiler } from "../crawler-profiler";

describe("TaskMonitor", () => {
  beforeEach(() => clearTimelines());

  it("creates a timeline with traceId", () => {
    const m = new TaskMonitor("bilibili", "test-123");
    const tl = m.getTimeline();
    expect(tl.traceId).toBe("test-123");
    expect(tl.site).toBe("bilibili");
    expect(tl.overallStatus).toBe("running");
    expect(tl.steps).toHaveLength(0);
  });

  it("auto-generates traceId when not provided", () => {
    const m = new TaskMonitor("zhihu");
    expect(m.getTraceId()).toBeTruthy();
  });

  it("records startStep and endStep", () => {
    const m = new TaskMonitor("bilibili");
    m.startStep("fetch:video_info");
    m.endStep(true);
    const tl = m.getTimeline();
    expect(tl.steps).toHaveLength(1);
    expect(tl.steps[0].name).toBe("fetch:video_info");
    expect(tl.steps[0].success).toBe(true);
    expect(tl.steps[0].endedAt).toBeGreaterThanOrEqual(tl.steps[0].startedAt);
  });

  it("records error in endStep", () => {
    const m = new TaskMonitor("bilibili");
    m.startStep("unit:bili_video_info");
    const err = new Error("code=-352: wbi signature failed");
    m.endStep(false, err);
    const tl = m.getTimeline();
    expect(tl.steps[0].success).toBe(false);
    expect(tl.steps[0].error?.message).toContain("wbi signature failed");
    expect(tl.steps[0].error?.code).toBe("-352");
    expect(tl.steps[0].error?.stack).toBeTruthy();
  });

  it("sets overallStatus to success when all steps pass", () => {
    const m = new TaskMonitor("bilibili");
    m.startStep("step1");
    m.endStep(true);
    m.startStep("step2");
    m.endStep(true);
    m.finish();
    expect(m.getTimeline().overallStatus).toBe("success");
  });

  it("sets overallStatus to failed when all steps fail", () => {
    const m = new TaskMonitor("bilibili");
    m.startStep("step1");
    m.endStep(false);
    m.startStep("step2");
    m.endStep(false);
    m.finish();
    expect(m.getTimeline().overallStatus).toBe("failed");
  });

  it("sets overallStatus to partial when some steps succeeded and some failed", () => {
    const m = new TaskMonitor("bilibili");
    m.startStep("step1");
    m.endStep(true);
    m.startStep("step2");
    m.endStep(false);
    m.finish();
    // At least one success and one failure → partial
    expect(m.getTimeline().overallStatus).toBe("partial");
  });

  it("captures error as a step", () => {
    const m = new TaskMonitor("bilibili");
    m.captureError("fetch:api", new Error("timeout"));
    const tl = m.getTimeline();
    expect(tl.steps).toHaveLength(1);
    expect(tl.steps[0].name).toBe("fetch:api");
    expect(tl.steps[0].success).toBe(false);
  });

  it("wraps a successful async fn", async () => {
    const m = new TaskMonitor("bilibili");
    const result = await m.wrap("do_work", async () => "done");
    expect(result).toBe("done");
    expect(m.getTimeline().steps[0].success).toBe(true);
  });

  it("wraps a failing async fn", async () => {
    const m = new TaskMonitor("bilibili");
    await expect(
      m.wrap("fail_work", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(m.getTimeline().steps[0].success).toBe(false);
  });

  it("stores timeline and retrieves by traceId", () => {
    const m = new TaskMonitor("zhihu", "zh-001");
    m.startStep("search");
    m.endStep(true);
    const retrieved = getTimeline("zh-001");
    expect(retrieved).toBeTruthy();
    expect(retrieved!.site).toBe("zhihu");
  });

  it("lists timelines in reverse chronological order", async () => {
    new TaskMonitor("site1", "a");
    await new Promise((r) => setTimeout(r, 2));
    new TaskMonitor("site2", "b");
    const list = listTimelines();
    expect(list).toHaveLength(2);
    expect(list[0].traceId).toBe("b"); // "b" created later → first
    expect(list[1].traceId).toBe("a");
  });

  it("sets labels", () => {
    const m = new TaskMonitor("xhs", "x-001");
    m.setLabel("note_id", "12345");
    expect(m.getTimeline().labels.note_id).toBe("12345");
  });

  it("limits store to MAX_TRACE_IDS (100)", () => {
    for (let i = 0; i < 105; i++) {
      new TaskMonitor(`site${i}`, `id-${i}`);
    }
    const list = listTimelines(200);
    expect(list.length).toBeLessThanOrEqual(100);
  });
});

describe("ErrorClassifier", () => {
  it("classifies -352 as SIGN_ERROR", () => {
    expect(classifyError("wbi signature error", "-352")).toBe("SIGN_ERROR");
  });

  it("classifies -352 in message as SIGN_ERROR", () => {
    expect(classifyError("API returned code=-352")).toBe("SIGN_ERROR");
  });

  it("classifies timeout as NETWORK_ERROR", () => {
    expect(classifyError("fetch timeout after 30s", "ETIMEDOUT")).toBe("NETWORK_ERROR");
  });

  it("classifies 503 as NETWORK_ERROR", () => {
    expect(classifyError("service unavailable", "503")).toBe("NETWORK_ERROR");
  });

  it("classifies captcha as CAPTCHA", () => {
    expect(classifyError("geetest verification required", "412")).toBe("CAPTCHA");
  });

  it("classifies login as SESSION_EXPIRED", () => {
    expect(classifyError("请先登录", "401")).toBe("SESSION_EXPIRED");
  });

  it("classifies 429 as RATE_LIMIT", () => {
    expect(classifyError("too many requests", "429")).toBe("RATE_LIMIT");
  });

  it("classifies selector error as DOM_CHANGE", () => {
    expect(classifyError("element not found: .video-info", "E103")).toBe("DOM_CHANGE");
  });

  it("classifies browser crash as BROWSER_ERROR", () => {
    expect(classifyError("page crash: Target closed", "E102")).toBe("BROWSER_ERROR");
  });

  it("classifies unknown error as UNKNOWN", () => {
    expect(classifyError("something weird happened")).toBe("UNKNOWN");
  });

  it("provides suggestion for -352 error", () => {
    const result = classifyWithSuggestion("wbi signature failed", "-352");
    expect(result.category).toBe("SIGN_ERROR");
    expect(result.suggestion).toContain("刷新密钥");
  });

  it("provides suggestion for rate limit", () => {
    const result = classifyWithSuggestion("too many requests", "429");
    expect(result.category).toBe("RATE_LIMIT");
    expect(result.suggestion).toContain("频率限制");
  });

  it("getSuggestion returns text for known category", () => {
    const s = getSuggestion("NETWORK_ERROR");
    expect(s).toContain("网络连接异常");
  });

  it("getSuggestion returns fallback for UNKNOWN", () => {
    const s = getSuggestion("UNKNOWN");
    expect(s).toContain("未知错误类型");
  });
});

describe("CrawlerProfiler", () => {
  let profiler: CrawlerProfiler;

  beforeEach(() => {
    profiler = new CrawlerProfiler();
  });

  it("records unit calls and builds profile", () => {
    profiler.recordUnitCall("bili_video_info", true, 100, "bilibili");
    profiler.recordUnitCall("bili_video_info", true, 50, "bilibili");
    profiler.recordUnitCall("bili_search", false, 200, "bilibili");

    const profile = profiler.getDomainProfile("bilibili");
    expect(profile.totalCalls).toBe(3);

    const videoUnit = profile.unitStats.find((u) => u.unit === "bili_video_info");
    expect(videoUnit).toBeTruthy();
    expect(videoUnit!.callCount).toBe(2);
    expect(videoUnit!.successCount).toBe(2);
    expect(videoUnit!.avgResponseTime).toBe(75);

    const searchUnit = profile.unitStats.find((u) => u.unit === "bili_search");
    expect(searchUnit!.callCount).toBe(1);
    expect(searchUnit!.failCount).toBe(1);
  });

  it("identifies unused units", () => {
    profiler.recordUnitCall("bili_video_info", true, 100, "bilibili");
    const profile = profiler.getDomainProfile("bilibili");
    expect(profile.unusedUnits).toContain("bili_search");
    expect(profile.unusedUnits).toContain("bili_user_videos");
    expect(profile.unusedUnits).toContain("bili_video_comments");
    expect(profile.unusedUnits).toContain("bili_video_sub_replies");
  });

  it("identifies high-failure units", () => {
    profiler.recordUnitCall("bili_search", false, 100, "bilibili");
    profiler.recordUnitCall("bili_search", false, 100, "bilibili");
    profiler.recordUnitCall("bili_search", true, 100, "bilibili");
    profiler.recordUnitCall("bili_video_info", true, 100, "bilibili");

    const profile = profiler.getDomainProfile("bilibili");
    expect(profile.highFailRateUnits).toContain("bili_search");
    expect(profile.highFailRateUnits).not.toContain("bili_video_info");
  });

  it("getAllDomainProfiles returns all domains", () => {
    profiler.recordUnitCall("bili_video_info", true, 100, "bilibili");
    profiler.recordUnitCall("zhihu_search", true, 100, "zhihu");

    const profiles = profiler.getAllDomainProfiles();
    expect(profiles).toHaveLength(2);
  });

  it("CrawlerProfiler singleton", () => {
    const s1 = getCrawlerProfiler();
    const s2 = getCrawlerProfiler();
    expect(s1).toBe(s2);
  });

  it("resets counters", () => {
    profiler.recordUnitCall("bili_video_info", true, 100, "bilibili");
    profiler.reset();
    const profile = profiler.getDomainProfile("bilibili");
    expect(profile.totalCalls).toBe(0);
  });
});
