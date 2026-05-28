import { describe, it, expect } from "@jest/globals";
import { TaskMonitor, clearTimelines, getTimeline } from "../task-monitor.js";

describe("auto_repair simulation", () => {
  beforeEach(() => clearTimelines());

  it("classifies -352 as SIGN_ERROR and provides repair suggestion", () => {
    const m = new TaskMonitor("bilibili", "repair-test-001");
    m.startStep("unit:bili_video_info");
    m.endStep(false, new Error("API returned code=-352: wbi signature failed"));
    m.finish();

    const timeline = getTimeline("repair-test-001");
    expect(timeline).toBeTruthy();
    expect(timeline!.overallStatus).toBe("failed");

    const step = timeline!.steps[0];
    expect(step.success).toBe(false);
    expect(step.error?.code).toBe("-352");
    expect(step.error?.category).toBe("SIGN_ERROR");
  });

  it("identifies failed units from timeline for retry", () => {
    const m = new TaskMonitor("bilibili", "repair-test-002");
    m.setLabel("aid", "12345");
    m.startStep("unit:bili_video_info");
    m.endStep(false, new Error("code=-352"));
    m.startStep("unit:bili_search");
    m.endStep(true);
    m.startStep("unit:bili_video_comments");
    m.endStep(false, new Error("network timeout"));
    m.finish();

    const failedUnits = m.getTimeline().steps
      .filter((s) => !s.success && s.name.startsWith("unit:"))
      .map((s) => s.name.slice(5));

    expect(failedUnits).toEqual(["bili_video_info", "bili_video_comments"]);
  });

  it("reports labels for retry params", () => {
    const m = new TaskMonitor("bilibili", "repair-test-003");
    m.setLabel("aid", "12345");
    m.setLabel("keyword", "test");

    const labels = m.getTimeline().labels;
    expect(labels).toEqual({ aid: "12345", keyword: "test" });
  });

  it("tracks multiple error categories for multi-step repair", () => {
    const m = new TaskMonitor("bilibili", "repair-test-004");
    m.startStep("unit:bili_video_info");
    m.endStep(false, new Error("code=-352: wbi signature failed"));
    m.startStep("unit:bili_search");
    m.endStep(false, new Error("cookie expired: 请重新登录"));
    m.finish();

    const categories = new Set(
      m.getTimeline().steps
        .filter((s) => s.error)
        .map((s) => s.error!.category),
    );

    expect(categories.has("SIGN_ERROR")).toBe(true);
    expect(categories.has("SESSION_EXPIRED")).toBe(true);
  });

  it("handles timeline with no errors (no repair needed)", () => {
    const m = new TaskMonitor("bilibili", "repair-test-005");
    m.startStep("unit:bili_video_info");
    m.endStep(true);
    m.finish();

    const failedSteps = m.getTimeline().steps.filter((s) => !s.success);
    expect(failedSteps).toHaveLength(0);
  });
});
