import http from "http";
import net from "net";
import { WebServer } from "../WebServer";

let port: number;
let server: WebServer;

function getPort(): Promise<number> {
  return new Promise((res) => {
    const s = net.createServer();
    s.listen(0, () => {
      const p = (s.address() as any).port;
      s.close(() => res(p));
    });
  });
}

let token = "";
let baseUrl = "";

async function login(): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ username: "admin", password: "admin" });
    const opts: http.RequestOptions = { hostname: "localhost", port, path: "/api/auth/login", method: "POST", headers: { "Content-Type": "application/json" } };
    const req = http.request(opts, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk.toString());
      res.on("end", () => {
        const j = JSON.parse(data);
        resolve(j.data?.token ?? "");
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

describe("SSE /api/tasks/stream", () => {
  beforeAll(async () => {
    port = await getPort();
    server = new WebServer();
    await server.start(port);
    baseUrl = `http://localhost:${port}`;
    await new Promise((r) => setTimeout(r, 500));
    token = await login();
  }, 15000);

  afterAll(() => {
    server.stop();
  });

  it("returns 401 without auth", (done) => {
    http.get(`${baseUrl}/api/tasks/stream`, (res) => {
      expect(res.statusCode).toBe(401);
      done();
    });
  });

  it("returns 503 when queue not enabled", (done) => {
    // WebServer without task queue enabled
    http.get(`${baseUrl}/api/tasks/stream?token=${encodeURIComponent(token)}`, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk.toString());
      res.on("end", () => {
        expect(res.statusCode).toBe(503);
        const j = JSON.parse(data);
        expect(j.code).toBe(-1);
        done();
      });
    });
  });

  it("streams queue:changed events when task queue is enabled", (done) => {
    // Create a new server with task queue
    const ws = new WebServer();
    ws.start(0).then(async () => {
      const p = (ws as any).server?.address()?.port;
      await new Promise((r) => setTimeout(r, 300));

      // Login
      const loginRes = await fetch(`http://localhost:${p}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "admin" }),
      });
      const loginData = await loginRes.json();
      const t = loginData.data?.token || "";

      // Enable task queue
      ws.enableTaskQueue(1);

      // Connect to SSE
      const sseRes = await fetch(`http://localhost:${p}/api/tasks/stream?token=${encodeURIComponent(t)}`);
      const reader = sseRes.body?.getReader();
      const decoder = new TextDecoder();
      let data = "";
      const timeout = setTimeout(() => {
        ws.stop();
        done(new Error("SSE timeout"));
      }, 5000);

      // Read initial event
      reader?.read().then(function process({ done: d, value }): any {
        if (d) { clearTimeout(timeout); ws.stop(); return; }
        data += decoder.decode(value, { stream: true });
        if (data.includes("event: queue")) {
          clearTimeout(timeout);
          expect(data).toContain("event: queue");
          expect(data).toContain("\"pending\"");
          ws.stop();
          done();
        }
      });
    });
  });
});
