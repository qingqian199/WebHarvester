import * as XLSX from "xlsx";
import { unitToSheet, exportResultsToXlsx } from "./xlsx-exporter";

describe("unitToSheet", () => {
  it("bili_video_info returns key-value sheet", () => {
    const { name, sheet } = unitToSheet("bili_video_info", {
      data: { title: "测试视频", stat: { view: 100000, like: 5000 } },
    });
    expect(name).toBe("视频信息");
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][];
    expect(rows.some((r) => r[0] === "标题" && r[1] === "测试视频")).toBe(true);
    expect(rows.some((r) => r[0] === "播放" && r[1] === "10.0万")).toBe(true);
  });

  it("bili_video_comments returns row-per-comment", () => {
    const { name, sheet } = unitToSheet("bili_video_comments", {
      data: {
        replies: [
          { member: { uname: "用户A" }, content: { message: "评论内容" }, like: 100, rcount: 3, ctime: 1700000000, rpid: 1 },
        ],
      },
    });
    expect(name).toBe("评论");
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][];
    expect(rows[1][0]).toBe("用户A");
    expect(rows[1][1]).toBe("评论内容");
  });

  it("bili_video_sub_replies flattens grouped replies", () => {
    const { name, sheet } = unitToSheet("bili_video_sub_replies", {
      data: {
        comments: {
          "100": { replies: [{ member: { uname: "回复A" }, content: { message: "内容1" }, like: 5, ctime: 1700000000 }] },
        },
      },
    });
    expect(name).toBe("子回复");
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][];
    expect(rows[1][0]).toBe("100");
    expect(rows[1][1]).toBe("回复A");
  });

  it("zhihu_hot_search returns ranked list", () => {
    const { name, sheet } = unitToSheet("zhihu_hot_search", {
      data: { hot_list: [{ query: "热搜第一", heat: 1000000 }] },
    });
    expect(name).toBe("热搜");
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][];
    expect(rows[1][1]).toBe("热搜第一");
  });

  it("user_info returns key-value", () => {
    const { sheet } = unitToSheet("user_info", {
      data: { nickname: "用户", follower_count: 10000 },
    });
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][];
    expect(rows.some((r) => r[0] === "昵称" && r[1] === "用户")).toBe(true);
  });

  it("unknown unit returns fallback sheet", () => {
    const { name } = unitToSheet("unknown", { foo: "bar" });
    expect(name).toBe("unknown");
  });
});

describe("exportResultsToXlsx", () => {
  it("produces a non-empty buffer from results", () => {
    const results = [
      { unit: "bili_video_info", status: "success", data: { data: { title: "t", stat: { view: 1 } } }, method: "sig", responseTime: 0 },
      { unit: "bili_video_comments", status: "success", data: { data: { replies: [{ member: { uname: "u" }, content: { message: "c" }, like: 1, ctime: 1, rpid: 1 }] } }, method: "sig", responseTime: 0 },
    ] as any;
    const buf = exportResultsToXlsx(results);
    expect(buf.length).toBeGreaterThan(100);
  });

  it("skips failed results, returns fallback sheet", () => {
    const buf = exportResultsToXlsx([{ unit: "bili_video_info", status: "failed", data: null, method: "none", responseTime: 0 } as any]);
    expect(buf.length).toBeGreaterThan(50);
  });
});
