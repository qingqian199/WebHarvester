import { MiddlewarePipeline } from "../../MiddlewarePipeline";
import { CrawlContext, CrawlResult, ICrawlMiddleware } from "../../../../core/ports/ICrawlMiddleware";

function createContext(overrides?: Partial<CrawlContext>): CrawlContext {
  return {
    url: "https://example.com/api",
    method: "GET",
    headers: {},
    site: "test",
    retryCount: 0,
    locals: {},
    ...overrides,
  };
}

function makeMiddleware(name: string, processFn?: (ctx: CrawlContext, next: () => Promise<CrawlResult>) => Promise<CrawlResult>): ICrawlMiddleware {
  return {
    name,
    process: processFn || jest.fn((_ctx, next) => next()),
  };
}

describe("MiddlewarePipeline", () => {
  it("executes middlewares in registration order", async () => {
    const order: string[] = [];
    const mw1 = makeMiddleware("first", async (_ctx, next) => { order.push("first"); return next(); });
    const mw2 = makeMiddleware("second", async (_ctx, next) => { order.push("second"); return next(); });
    const mw3 = makeMiddleware("third", async (_ctx, next) => { order.push("third"); return next(); });
    const pipeline = new MiddlewarePipeline();
    pipeline.use(mw1);
    pipeline.use(mw2);
    pipeline.use(mw3);
    const ctx = createContext();
    const finalFetch = jest.fn().mockResolvedValue({ statusCode: 200, body: "{}", headers: {}, responseTime: 50 } as CrawlResult);
    await pipeline.execute(ctx, finalFetch);
    expect(order).toEqual(["first", "second", "third"]);
  });

  it("calls finalFetch after all middlewares", async () => {
    const pipeline = new MiddlewarePipeline();
    pipeline.use(makeMiddleware("mw1"));
    pipeline.use(makeMiddleware("mw2"));
    const ctx = createContext();
    const finalFetch = jest.fn().mockResolvedValue({ statusCode: 200, body: "ok", headers: {}, responseTime: 50 } as CrawlResult);
    await pipeline.execute(ctx, finalFetch);
    expect(finalFetch).toHaveBeenCalledTimes(1);
    expect(finalFetch).toHaveBeenCalledWith(ctx);
  });

  it("passes context through middleware chain", async () => {
    const pipeline = new MiddlewarePipeline();
    const mw1 = makeMiddleware("header-setter", async (ctx, next) => {
      ctx.headers["X-Chain"] = "passed";
      return next();
    });
    pipeline.use(mw1);
    const ctx = createContext();
    const finalFetch = jest.fn().mockImplementation(async (c: CrawlContext) => {
      expect(c.headers["X-Chain"]).toBe("passed");
      return { statusCode: 200, body: "{}", headers: {}, responseTime: 50 } as CrawlResult;
    });
    await pipeline.execute(ctx, finalFetch);
    expect(finalFetch).toHaveBeenCalled();
  });

  it("short-circuits when middleware throws", async () => {
    const pipeline = new MiddlewarePipeline();
    const mwOk = makeMiddleware("ok", async (_ctx, next) => next());
    const mwFail = makeMiddleware("fail", async () => { throw new Error("mw failed"); });
    const mwNever = makeMiddleware("never", jest.fn());
    pipeline.use(mwOk);
    pipeline.use(mwFail);
    pipeline.use(mwNever);
    const ctx = createContext();
    const finalFetch = jest.fn();
    await expect(pipeline.execute(ctx, finalFetch)).rejects.toThrow("mw failed");
    expect(mwNever.process).not.toHaveBeenCalled();
    expect(finalFetch).not.toHaveBeenCalled();
  });

  it("compose returns a function", () => {
    const pipeline = new MiddlewarePipeline();
    const finalFetch = jest.fn();
    const handler = pipeline.compose(finalFetch);
    expect(typeof handler).toBe("function");
  });

  it("middleware can modify result before returning", async () => {
    const pipeline = new MiddlewarePipeline();
    const mw = makeMiddleware("modifier", async (_ctx, next) => {
      const result = await next();
      return { ...result, statusCode: 201, headers: { ...result.headers, "X-Modified": "yes" } };
    });
    pipeline.use(mw);
    const ctx = createContext();
    const finalFetch = jest.fn().mockResolvedValue({ statusCode: 200, body: "original", headers: {}, responseTime: 50 } as CrawlResult);
    const result = await pipeline.execute(ctx, finalFetch);
    expect(result.statusCode).toBe(201);
    expect(result.headers["X-Modified"]).toBe("yes");
    expect(result.body).toBe("original");
  });

  it("clear removes all middlewares", async () => {
    const pipeline = new MiddlewarePipeline();
    pipeline.use(makeMiddleware("mw1"));
    pipeline.clear();
    expect(pipeline.list).toHaveLength(0);
    const ctx = createContext();
    const finalFetch = jest.fn().mockResolvedValue({ statusCode: 200, body: "{}", headers: {}, responseTime: 50 } as CrawlResult);
    const result = await pipeline.execute(ctx, finalFetch);
    expect(finalFetch).toHaveBeenCalledTimes(1);
    expect(result.statusCode).toBe(200);
  });

  it("remove deletes a middleware by name", async () => {
    const pipeline = new MiddlewarePipeline();
    pipeline.use(makeMiddleware("keep"));
    pipeline.use(makeMiddleware("remove-me"));
    pipeline.use(makeMiddleware("keep-too"));
    pipeline.remove("remove-me");
    expect(pipeline.list.map((m) => m.name)).toEqual(["keep", "keep-too"]);
  });
});
