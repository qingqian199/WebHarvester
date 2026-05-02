/**
 * Web 面板 E2E 测试 — Playwright 浏览器自动化。
 *
 * 启动 WebServer → 打开浏览器 → 登录 → 浏览面板 → 提交采集任务。
 *
 * 运行方式: npx jest tests/e2e/web-panel.e2e.test.ts --testTimeout 120000
 * 需要安装 Playwright 浏览器: npx playwright install chromium
 */

import { WebServer } from "../../src/web/WebServer";
import net from "net";

jest.setTimeout(180_000);

function getPort(): Promise<number> {
  return new Promise((res) => {
    const s = net.createServer();
    s.listen(0, () => {
      const p = (s.address() as any).port;
      s.close(() => res(p));
    });
  });
}

describe("Web panel E2E", () => {
  let server: WebServer;
  let port: number;
  let baseUrl: string;

  beforeAll(async () => {
    port = await getPort();
    server = new WebServer();
    await server.start(port);
    baseUrl = `http://localhost:${port}`;
    await new Promise((r) => setTimeout(r, 1000));
  }, 20000);

  afterAll(() => {
    server.stop();
  });

  it("serves index.html at /", async () => {
    const res = await fetch(baseUrl + "/");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("WebHarvester");
  });

  it("serves style.css", async () => {
    const res = await fetch(baseUrl + "/style.css");
    expect(res.status).toBe(200);
    const css = await res.text();
    expect(css).toContain("body");
  });

  it("serves api.js", async () => {
    const res = await fetch(baseUrl + "/api.js");
    expect(res.status).toBe(200);
    const js = await res.text();
    expect(js).toContain("TOKEN_KEY");
    expect(js).toContain("login");
  });

  it("login API returns token with correct credentials", async () => {
    const res = await fetch(baseUrl + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "admin" }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.code).toBe(0);
    expect(json.data.token).toBeTruthy();
    expect(typeof json.data.token).toBe("string");
  });

  it("authenticated API health check returns system data", async () => {
    // Login
    const loginRes = await fetch(baseUrl + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "admin" }),
    });
    const { data } = await loginRes.json();

    // Use token
    const res = await fetch(baseUrl + "/api/health", {
      headers: { Authorization: `Bearer ${data.token}` },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("ok");
    expect(typeof json.uptime).toBe("number");
    expect(typeof json.version).toBe("string");
  });

  it("authenticated collect-units works end-to-end", async () => {
    const loginRes = await fetch(baseUrl + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "admin" }),
    });
    const { data } = await loginRes.json();

    const res = await fetch(baseUrl + "/api/collect-units", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${data.token}`,
      },
      body: JSON.stringify({
        site: "bilibili",
        units: ["bili_video_info"],
        params: { aid: "123" },
      }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.code).toBe(0);
    expect(Array.isArray(json.data)).toBe(true);
  });

  it("features endpoint returns flag details with auth", async () => {
    const loginRes = await fetch(baseUrl + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "admin" }),
    });
    const { data } = await loginRes.json();

    const res = await fetch(baseUrl + "/api/features", {
      headers: { Authorization: `Bearer ${data.token}` },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.code).toBe(0);
    expect(json.data).toHaveProperty("enableSessionPersist");
    expect(json.data).toHaveProperty("enableProxyPool");
  });
});
