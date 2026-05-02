import { setupSignatureInjection } from "../xhs-sign-injector";

describe("setupSignatureInjection", () => {
  let capturedHeaders: Record<string, string> | null = null;
  let continued = false;
  let mockRoute: any;
  let mockPage: any;

  beforeEach(() => {
    capturedHeaders = null;
    continued = false;
    mockRoute = {
      continue: jest.fn().mockImplementation((opts) => {
        if (opts?.headers) capturedHeaders = opts.headers;
        continued = true;
      }),
      request: () => mockRequest,
    };
    mockPage = {
      route: jest.fn(),
      unroute: jest.fn().mockResolvedValue(undefined),
    };
  });

  const mockRequest = {
    url: () => "https://edith.xiaohongshu.com/api/sns/web/v1/search/onebox",
    method: () => "POST",
    postData: () => "{\"keyword\":\"test\",\"search_id\":\"abc123\"}",
    headers: () => ({
      "accept": "application/json",
      "x-s": "OLD_XS_VALUE",
      "x-t": "OLD_XT_VALUE",
      "x-s-common": "OLD_COMMON",
      "x-b3-traceid": "DYNAMIC_TRACE_ID",
      "x-xray-traceid": "DYNAMIC_XRAY_ID",
    }),
  };

  it("replaces X-s/X-t/X-s-common headers", async () => {
    setupSignatureInjection(mockPage as any);
    expect(mockPage.route).toHaveBeenCalled();
    const handler = (mockPage.route as jest.Mock).mock.calls[0][1];
    await handler(mockRoute);
    expect(continued).toBe(true);
    expect(capturedHeaders).toBeDefined();
    expect(capturedHeaders!["x-s"]).not.toBe("OLD_XS_VALUE");
    expect(capturedHeaders!["x-s"]).toMatch(/^XYS_/);
    expect(capturedHeaders!["x-t"]).toMatch(/^\d+$/);
    expect(capturedHeaders!["x-s-common"]).toBeTruthy();
  });

  it("preserves SDK-injected dynamic headers", async () => {
    setupSignatureInjection(mockPage as any);
    const handler = (mockPage.route as jest.Mock).mock.calls[0][1];
    await handler(mockRoute);
    expect(capturedHeaders!["x-b3-traceid"]).toBe("DYNAMIC_TRACE_ID");
    expect(capturedHeaders!["x-xray-traceid"]).toBe("DYNAMIC_XRAY_ID");
  });

  it("passes through non-XHS API requests unchanged", async () => {
    const plainRoute = {
      continue: jest.fn(),
      request: () => ({
        url: () => "https://www.google.com/",
        method: () => "GET",
        headers: () => ({}),
      }),
    };
    setupSignatureInjection(mockPage as any);
    const handler = (mockPage.route as jest.Mock).mock.calls[0][1];
    await handler(plainRoute);
    expect(plainRoute.continue).toHaveBeenCalledWith();
  });

  it("handles errors gracefully", async () => {
    const errorRoute = {
      continue: jest.fn(),
      request: () => { throw new Error("test error"); },
    };
    setupSignatureInjection(mockPage as any);
    const handler = (mockPage.route as jest.Mock).mock.calls[0][1];
    await handler(errorRoute);
    expect(errorRoute.continue).toHaveBeenCalled();
  });

  it("uses correct apiPath (pathname without query)", async () => {
    const routeWithQuery = {
      continue: jest.fn().mockImplementation((opts) => {
        if (opts?.headers) capturedHeaders = opts.headers;
        continued = true;
      }),
      request: () => ({
        url: () => "https://edith.xiaohongshu.com/api/sns/web/v1/search/filter?keyword=%E5%8E%9F%E7%A5%9E&search_id=abc",
        method: () => "GET",
        postData: () => "",
        headers: () => ({ "x-s": "OLD" }),
      }),
    };
    setupSignatureInjection(mockPage as any);
    const handler = (mockPage.route as jest.Mock).mock.calls[0][1];
    await handler(routeWithQuery);
    expect(capturedHeaders!["x-s"]).toMatch(/^XYS_/);
  });

  it("preserves SDK-injected dynamic headers", async () => {
    setupSignatureInjection(mockPage as any);
    const handler = (mockPage.route as jest.Mock).mock.calls[0][1];
    await handler(mockRoute);

    expect(capturedHeaders!["x-b3-traceid"]).toBe("DYNAMIC_TRACE_ID");
    expect(capturedHeaders!["x-xray-traceid"]).toBe("DYNAMIC_XRAY_ID");
  });

  it("passes through non-XHS API requests unchanged", async () => {
    const plainRoute = {
      continue: jest.fn(),
      request: () => ({
        url: () => "https://www.google.com/",
        method: () => "GET",
        headers: () => ({}),
      }),
    };
    setupSignatureInjection(mockPage as any);
    const handler = (mockPage.route as jest.Mock).mock.calls[0][1];
    await handler(plainRoute);
    expect(plainRoute.continue).toHaveBeenCalledWith();
  });

  it("disable function removes route handler", async () => {
    const disable = setupSignatureInjection(mockPage as any);
    disable();
    expect(mockPage.unroute).toHaveBeenCalled();
  });

  it("handles errors gracefully", async () => {
    const errorRoute = {
      continue: jest.fn(),
      request: () => { throw new Error("test error"); },
    };
    setupSignatureInjection(mockPage as any);
    const handler = (mockPage.route as jest.Mock).mock.calls[0][1];
    await handler(errorRoute);
    expect(errorRoute.continue).toHaveBeenCalled();
  });

  it("uses correct apiPath (pathname without query)", async () => {
    const routeWithQuery = {
      continue: jest.fn().mockImplementation((opts) => {
        if (opts?.headers) capturedHeaders = opts.headers;
        continued = true;
      }),
      request: () => ({
        url: () => "https://edith.xiaohongshu.com/api/sns/web/v1/search/filter?keyword=%E5%8E%9F%E7%A5%9E&search_id=abc",
        method: () => "GET",
        postData: () => "",
        headers: () => ({ "x-s": "OLD" }),
      }),
    };
    setupSignatureInjection(mockPage as any);
    const handler = (mockPage.route as jest.Mock).mock.calls[0][1];
    await handler(routeWithQuery);
    expect(capturedHeaders!["x-s"]).toMatch(/^XYS_/);
  });
});
