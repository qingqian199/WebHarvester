import { MiddlewarePipeline } from "../MiddlewarePipeline";
import { ICrawlMiddleware, CrawlContext } from "../../../core/ports/ICrawlMiddleware";

describe("MiddlewarePipeline", () => {
  it("executes middleware in order", async () => {
    const order: string[] = [];
    const mw1: ICrawlMiddleware = {
      name: "MW1",
      async process(ctx, next) { order.push("1"); return next(); },
    };
    const mw2: ICrawlMiddleware = {
      name: "MW2",
      async process(ctx, next) { order.push("2"); return next(); },
    };

    const pipe = new MiddlewarePipeline();
    pipe.use(mw1);
    pipe.use(mw2);

    const result = await pipe.execute(
      { url: "http://test.com", method: "GET", headers: {}, site: "test", retryCount: 0, locals: {} },
      async () => {
        order.push("fetch");
        return { statusCode: 200, body: "ok", headers: {}, responseTime: 10 };
      },
    );
    expect(result.body).toBe("ok");
    expect(order).toEqual(["1", "2", "fetch"]);
  });

  it("middleware can short-circuit by not calling next", async () => {
    const mw1: ICrawlMiddleware = {
      name: "ShortCircuit",
      async process(_ctx, _next) {
        return { statusCode: 418, body: "blocked", headers: {}, responseTime: 0 };
      },
    };
    const pipe = new MiddlewarePipeline();
    pipe.use(mw1);

    let fetchCalled = false;
    const result = await pipe.execute(
      { url: "http://test.com", method: "GET", headers: {}, site: "test", retryCount: 0, locals: {} },
      async () => { fetchCalled = true; return { statusCode: 200, body: "", headers: {}, responseTime: 0 }; },
    );
    expect(result.statusCode).toBe(418);
    expect(fetchCalled).toBe(false);
  });

  it("middleware can modify context", async () => {
    const mw1: ICrawlMiddleware = {
      name: "HeaderAdder",
      async process(ctx, next) {
        ctx.headers["X-Custom"] = "value";
        return next();
      },
    };
    const pipe = new MiddlewarePipeline();
    pipe.use(mw1);

    let capturedCtx: CrawlContext | undefined;
    await pipe.execute(
      { url: "http://test.com", method: "GET", headers: {}, site: "test", retryCount: 0, locals: {} },
      async (ctx) => { capturedCtx = ctx; return { statusCode: 200, body: "", headers: {}, responseTime: 0 }; },
    );
    expect(capturedCtx!.headers["X-Custom"]).toBe("value");
  });

  it("middleware can wrap result", async () => {
    const mw1: ICrawlMiddleware = {
      name: "Wrapper",
      async process(_ctx, next) {
        const result = await next();
        return { ...result, body: result.body.toUpperCase() };
      },
    };
    const pipe = new MiddlewarePipeline();
    pipe.use(mw1);

    const result = await pipe.execute(
      { url: "http://test.com", method: "GET", headers: {}, site: "test", retryCount: 0, locals: {} },
      async () => ({ statusCode: 200, body: "hello", headers: {}, responseTime: 0 }),
    );
    expect(result.body).toBe("HELLO");
  });

  it("compose builds correct chain", async () => {
    const order: string[] = [];
    const mw1: ICrawlMiddleware = {
      name: "A",
      async process(_ctx, next) { order.push("A"); return next(); },
    };
    const pipe = new MiddlewarePipeline();
    pipe.use(mw1);
    pipe.use(mw1); // same middleware twice

    const handler = pipe.compose(async () => { order.push("F"); return { statusCode: 200, body: "", headers: {}, responseTime: 0 }; });
    await handler({ url: "", method: "GET", headers: {}, site: "t", retryCount: 0, locals: {} });
    expect(order).toEqual(["A", "A", "F"]);
  });

  it("clear removes all middleware", async () => {
    const mw1: ICrawlMiddleware = {
      name: "A",
      async process(_ctx, next) { return next(); },
    };
    const pipe = new MiddlewarePipeline();
    pipe.use(mw1);
    pipe.clear();
    expect(pipe.list).toHaveLength(0);
  });

  it("remove removes specific middleware", async () => {
    const mw1: ICrawlMiddleware = { name: "A", async process(_ctx, next) { return next(); } };
    const mw2: ICrawlMiddleware = { name: "B", async process(_ctx, next) { return next(); } };
    const pipe = new MiddlewarePipeline();
    pipe.use(mw1);
    pipe.use(mw2);
    pipe.remove("A");
    expect(pipe.list.map((m) => m.name)).toEqual(["B"]);
  });
});
