import { formatError, getErrorEntry, apiErrorBody } from "../error-registry";
import { ErrorCode } from "../ErrorCode";

describe("error-registry", () => {
  describe("getErrorEntry", () => {
    it("returns entry for known ErrorCode", () => {
      const entry = getErrorEntry(ErrorCode.EMPTY_TASK_CONFIG);
      expect(entry.message).toBeTruthy();
      expect(entry.suggestion).toBeTruthy();
    });

    it("returns unknown error entry for unrecognized code", () => {
      const entry = getErrorEntry("E999");
      expect(entry.message).toBe("未知错误");
    });

    it("falls back to unknown for completely invalid code", () => {
      const entry = getErrorEntry("ZZZ");
      expect(entry.message).toBe("未知错误");
    });
  });

  describe("formatError", () => {
    it("formats with code and message", () => {
      const result = formatError("E001");
      expect(result).toContain("[E001]");
      expect(result).toContain("建议：");
    });

    it("includes detail when provided", () => {
      const result = formatError("E105", "http://example.com");
      expect(result).toContain("(http://example.com)");
    });

    it("formats network error with suggestion", () => {
      const result = formatError("E105");
      expect(result).toContain("[E105]");
      expect(result).toContain("网络请求失败");
      expect(result).toContain("请检查网络连接");
    });

    it("formats browser launch error with suggestion", () => {
      const result = formatError("E101");
      expect(result).toContain("[E101]");
      expect(result).toContain("浏览器启动失败");
      expect(result).toContain("请确认已安装 Chromium");
    });

    it("formats file write error with suggestion", () => {
      const result = formatError("E302");
      expect(result).toContain("[E302]");
      expect(result).toContain("文件写入失败");
      expect(result).toContain("请检查磁盘空间");
    });

    it("formats config error with suggestion", () => {
      const result = formatError("E004");
      expect(result).toContain("[E004]");
      expect(result).toContain("任务配置为空");
      expect(result).toContain("请提供至少一个待采集的 URL");
    });
  });

  describe("apiErrorBody", () => {
    it("returns structured error object", () => {
      const body = apiErrorBody("E001", "detail text");
      expect(body.error).toBe(true);
      expect(body.code).toBe("E001");
      expect(body.message).toBeTruthy();
      expect(body.suggestion).toBeTruthy();
      expect(body.detail).toBe("detail text");
    });

    it("detail is null when omitted", () => {
      const body = apiErrorBody("E105");
      expect(body.detail).toBeNull();
    });
  });
});
