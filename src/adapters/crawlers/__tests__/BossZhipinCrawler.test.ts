import { BossZhipinCrawler, BossApiEndpoints } from "../BossZhipinCrawler";

describe("BossZhipinCrawler", () => {
  const crawler = new BossZhipinCrawler();

  describe("matches", () => {
    it("matches zhipin.com URLs", () => {
      expect(crawler.matches("https://www.zhipin.com/web/geek/jobs")).toBe(true);
      expect(crawler.matches("https://zhipin.com")).toBe(true);
    });

    it("does not match other domains", () => {
      expect(crawler.matches("https://example.com")).toBe(false);
    });

    it("returns false for invalid URL", () => {
      expect(crawler.matches("not a url")).toBe(false);
    });
  });

  describe("getReferer", () => {
    it("returns BOSS jobs page", () => {
      expect(crawler["getReferer"]("")).toBe("https://www.zhipin.com/web/geek/jobs");
    });
  });

  describe("addAuthHeaders", () => {
    it("injects standard BOSS headers", () => {
      const headers: Record<string, string> = {};
      crawler["addAuthHeaders"](headers, "", "GET", "", undefined);
      expect(headers["x-requested-with"]).toBe("XMLHttpRequest");
      expect(headers["Origin"]).toBe("https://www.zhipin.com");
      expect(headers["Referer"]).toBe("https://www.zhipin.com/web/geek/jobs");
    });
  });

  describe("BossApiEndpoints", () => {
    it("all endpoints are verified", () => {
      for (const ep of BossApiEndpoints) expect(ep.status).toBe("verified");
    });

    it("includes key endpoints", () => {
      const names = BossApiEndpoints.map((e) => e.name);
      expect(names).toContain("城市列表");
      expect(names).toContain("搜索职位");
    });
  });

  describe("collectUnits", () => {
    let crawler: BossZhipinCrawler;

    beforeEach(() => {
      crawler = new BossZhipinCrawler();
      crawler.tokenManager["_ready"] = true;
      jest.spyOn(crawler as any, "fetchApi").mockResolvedValue({
        url: "https://www.zhipin.com/wapi/test",
        statusCode: 200,
        body: JSON.stringify({ code: 0, message: "Success", zpData: {} }),
        headers: { "content-type": "application/json" },
        responseTime: 100,
        capturedAt: new Date().toISOString(),
      });
    });

    afterEach(() => { jest.restoreAllMocks(); });

    it("returns success for boss_city_list", async () => {
      const results = await crawler.collectUnits(["boss_city_list"], {});
      expect(results[0].status).toBe("success");
    });

    it("returns success for boss_filter_conditions", async () => {
      const results = await crawler.collectUnits(["boss_filter_conditions"], {});
      expect(results[0].status).toBe("success");
    });

    it("requires keyword for boss_search", async () => {
      const results = await crawler.collectUnits(["boss_search"], {});
      expect(results[0].status).toBe("failed");
      expect(results[0].error).toContain("缺少 keyword");
    });

    it("requires jobId for boss_job_detail", async () => {
      const results = await crawler.collectUnits(["boss_job_detail"], {});
      expect(results[0].status).toBe("failed");
      expect(results[0].error).toContain("缺少 jobId");
    });

    it("returns failed for unknown unit", async () => {
      const results = await crawler.collectUnits(["unknown_unit" as any], {});
      expect(results[0].status).toBe("failed");
    });
  });
});
