import { WebServer } from "../../src/web/WebServer";
import { ConsoleLogger } from "../../src/adapters/ConsoleLogger";

describe("WebServer /health endpoint", () => {
  let server: WebServer;
  let port: number;

  beforeAll(async () => {
    server = new WebServer(new ConsoleLogger("error"));
    await server.start(0);
    // 获取实际分配的端口
    port = (server as any).server?.address()?.port ?? 3000;
  });

  afterAll(async () => {
    server.stop();
  });

  it("returns status ok", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  it("includes uptime", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    const body = await res.json();
    expect(body.uptime).toBeGreaterThanOrEqual(0);
  });

  it("includes version string", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    const body = await res.json();
    expect(typeof body.version).toBe("string");
    expect(body.version.length).toBeGreaterThan(0);
  });

  it("includes platform", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    const body = await res.json();
    expect(body.platform).toBeTruthy();
  });

  it("includes memoryUsage with heapUsed and rss", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    const body = await res.json();
    expect(body.memoryUsage).toBeDefined();
    expect(body.memoryUsage.heapUsed).toBeGreaterThan(0);
    expect(body.memoryUsage.rss).toBeGreaterThan(0);
  });

  it("returns placeholder zero for taskQueueLength and activeBrowsers", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    const body = await res.json();
    expect(body.taskQueueLength).toBe(0);
    expect(body.activeBrowsers).toBe(0);
  });

  it("GET /api/health also works", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });
});
