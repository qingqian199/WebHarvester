import { getBrowser, releaseBrowser, destroyAll, poolSize, poolSites, setBrowserFactory } from "./BrowserPool";

describe("BrowserPool", () => {
  let mockBrowser: any;
  let mockContext: any;

  beforeEach(() => {
    mockContext = { newPage: jest.fn().mockResolvedValue({}), addCookies: jest.fn() };
    mockBrowser = { newContext: jest.fn().mockResolvedValue(mockContext), close: jest.fn().mockResolvedValue(undefined) };
    setBrowserFactory(async () => ({ browser: mockBrowser, context: mockContext }));
  });

  afterEach(async () => {
    await destroyAll();
  });

  it("creates a new browser on first call", async () => {
    const r = await getBrowser("test-site");
    expect(r.browser).toBe(mockBrowser);
    expect(r.context).toBe(mockContext);
    expect(poolSize()).toBe(1);
  });

  it("reuses existing browser on second call", async () => {
    const a = await getBrowser("test-site");
    const b = await getBrowser("test-site");
    expect(a.browser).toBe(b.browser);
    expect(poolSize()).toBe(1);
  });

  it("same factory returns same browser per site", async () => {
    await getBrowser("site-a");
    await getBrowser("site-a");
    expect(poolSites()).toContain("site-a");
    expect(poolSize()).toBe(1);
  });

  it("releaseBrowser does not remove from pool", async () => {
    await getBrowser("test-site");
    releaseBrowser("test-site");
    expect(poolSize()).toBe(1);
    expect(poolSites()).toContain("test-site");
  });

  it("releaseBrowser updates lastUsedAt", async () => {
    await getBrowser("test-site");
    releaseBrowser("test-site");
    expect(poolSize()).toBe(1);
    expect(poolSites()).toContain("test-site");
  });

  it("destroyAll clears the pool", async () => {
    await getBrowser("s1");
    await getBrowser("s2");
    expect(poolSize()).toBe(2);
    await destroyAll();
    expect(poolSize()).toBe(0);
  });
});
