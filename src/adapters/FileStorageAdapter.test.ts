import { FileStorageAdapter, LocalFileSystem } from "./FileStorageAdapter";
import { HarvestResult } from "../core/models";
import path from "path";

function stubResult(overrides?: Partial<HarvestResult>): HarvestResult {
  return {
    traceId: "test_trace",
    targetUrl: "https://example.com/page",
    networkRequests: [],
    elements: [],
    storage: { localStorage: {}, sessionStorage: {}, cookies: [] },
    jsVariables: {},
    startedAt: 1000,
    finishedAt: 2000,
    ...overrides,
  };
}

function mockFs(): jest.Mocked<LocalFileSystem> {
  return {
    mkdir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
  };
}

describe("FileStorageAdapter", () => {
  let fs: jest.Mocked<LocalFileSystem>;
  let adapter: FileStorageAdapter;

  beforeEach(() => {
    fs = mockFs();
    adapter = new FileStorageAdapter("/tmp/out", {}, fs);
  });

  it("creates output directory", async () => {
    await adapter.save(stubResult());
    expect(fs.mkdir).toHaveBeenCalledWith(path.join("/tmp/out", "example_com"));
  });

  it("writes JSON result file", async () => {
    await adapter.save(stubResult());
    expect(fs.writeFile).toHaveBeenCalledWith(
      path.join("/tmp/out", "example_com", "harvest-test_trace.json"),
      expect.any(String),
    );
  });

  it("writes JSON content that can be parsed back", async () => {
    await adapter.save(stubResult({ traceId: "abc" }));
    const call = fs.writeFile.mock.calls.find(c => (c[0] as string).endsWith(".json"));
    const parsed = JSON.parse(call![1] as string);
    expect(parsed.traceId).toBe("abc");
  });

  it("writes MD report when outputFormat is 'all'", async () => {
    await adapter.save(stubResult(), "all");
    const mdCall = fs.writeFile.mock.calls.find(c => (c[0] as string).endsWith(".md"));
    expect(mdCall).toBeTruthy();
  });

  it("writes CSV when outputFormat is 'all'", async () => {
    await adapter.save(stubResult(), "all");
    const csvCall = fs.writeFile.mock.calls.find(c => (c[0] as string).endsWith("-api.csv"));
    expect(csvCall).toBeTruthy();
  });

  it("does not write MD when outputFormat is 'csv'", async () => {
    await adapter.save(stubResult(), "csv");
    const mdCall = fs.writeFile.mock.calls.find(c => (c[0] as string).endsWith(".md"));
    expect(mdCall).toBeUndefined();
  });

  it("does not write CSV when outputFormat is 'md'", async () => {
    await adapter.save(stubResult(), "md");
    const csvCall = fs.writeFile.mock.calls.find(c => (c[0] as string).endsWith("-api.csv"));
    expect(csvCall).toBeUndefined();
  });

  it("skips anti-crawl file when no items tagged", async () => {
    await adapter.save(stubResult({ networkRequests: [] }));
    const acCall = fs.writeFile.mock.calls.find(c => (c[0] as string).includes("anti-crawl"));
    expect(acCall).toBeUndefined();
  });

  it("does not crash on empty network requests", async () => {
    await expect(adapter.save(stubResult({ networkRequests: [] }))).resolves.toBeUndefined();
  });

  it("writes files even when analysis is missing", async () => {
    const result = stubResult();
    delete (result as any).analysis;
    await adapter.save(result);
    expect(fs.writeFile).toHaveBeenCalled();
  });
});
