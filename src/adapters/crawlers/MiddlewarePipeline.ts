import { ICrawlMiddleware, CrawlContext, CrawlResult, FinalFetchFn } from "../../core/ports/ICrawlMiddleware";

export class MiddlewarePipeline {
  private middlewares: ICrawlMiddleware[] = [];

  use(mw: ICrawlMiddleware): void {
    this.middlewares.push(mw);
  }

  remove(name: string): void {
    this.middlewares = this.middlewares.filter((m) => m.name !== name);
  }

  clear(): void {
    this.middlewares = [];
  }

  get list(): readonly ICrawlMiddleware[] {
    return this.middlewares;
  }

  compose(finalFetch: FinalFetchFn): (ctx: CrawlContext) => Promise<CrawlResult> {
    const chain = [...this.middlewares];
    let composed = finalFetch;
    for (let i = chain.length - 1; i >= 0; i--) {
      const mw = chain[i];
      const next = composed;
      composed = (ctx: CrawlContext) => mw.process(ctx, () => next(ctx));
    }
    return composed;
  }

  async execute(ctx: CrawlContext, finalFetch: FinalFetchFn): Promise<CrawlResult> {
    const handler = this.compose(finalFetch);
    return handler(ctx);
  }
}
