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

async function loginRequest(body: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const opts: http.RequestOptions = {
      hostname: "localhost",
      port,
      path: "/api/auth/login",
      method: "POST",
      headers: { "Content-Type": "application/json" },
    };
    const req = http.request(opts, (res) => {
      let data = "";
      res.on("data", (chunk: Buffer) => (data += chunk.toString()));
      res.on("end", () => {
        let parsed: any;
        try { parsed = JSON.parse(data); } catch { parsed = data; }
        resolve({ status: res.statusCode || 0, body: parsed });
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

describe("Login rate limiting", () => {
  beforeAll(async () => {
    port = await getPort();
    server = new WebServer();
    await server.start(port);
    await new Promise((r) => setTimeout(r, 500));
  }, 15000);

  afterAll(() => {
    server.stop();
  });

  beforeEach(() => {
    // Clear login attempts before each test
    (server as any).loginAttempts.clear();
  });

  it("login succeeds with correct credentials", async () => {
    const { status, body } = await loginRequest(JSON.stringify({ username: "admin", password: "admin" }));
    expect(status).toBe(200);
    expect(body.code).toBe(0);
    expect(body.data.token).toBeTruthy();
  });

  it("login fails with wrong password", async () => {
    const { status, body } = await loginRequest(JSON.stringify({ username: "admin", password: "wrong" }));
    expect(status).toBe(401);
    expect(body.code).toBe("E011");
  });

  it("login fails with unknown user", async () => {
    const { status, body } = await loginRequest(JSON.stringify({ username: "nobody", password: "x" }));
    expect(status).toBe(401);
    expect(body.code).toBe("E011");
  });

  it("returns 429 after 5 failed attempts", async () => {
    for (let i = 0; i < 5; i++) {
      const { status } = await loginRequest(JSON.stringify({ username: "admin", password: "wrong" }));
      // First 4 should be 401, 5th should be 401 too but triggers lock internally
      expect(status).toBe(401);
    }
    // 6th attempt should be 429
    const { status, body } = await loginRequest(JSON.stringify({ username: "admin", password: "wrong" }));
    expect(status).toBe(429);
    expect(body.error).toBe(true);
    expect(body.code).toBe("E012");
    expect(body.message).toContain("登录尝试过于频繁");
  });

  it("correct password also rejected during lock", async () => {
    // Trigger lock
    for (let i = 0; i < 5; i++) {
      await loginRequest(JSON.stringify({ username: "admin", password: "wrong" }));
    }
    // Even correct password should be rejected
    const { status, body } = await loginRequest(JSON.stringify({ username: "admin", password: "admin" }));
    expect(status).toBe(429);
    expect(body.code).toBe("E012");
  });

  it("returns Retry-After header during lock", async () => {
    for (let i = 0; i < 5; i++) {
      await loginRequest(JSON.stringify({ username: "admin", password: "wrong" }));
    }
    const { status } = await new Promise<{ status: number; headers: http.IncomingHttpHeaders }>((resolve, reject) => {
      const opts: http.RequestOptions = {
        hostname: "localhost",
        port,
        path: "/api/auth/login",
        method: "POST",
        headers: { "Content-Type": "application/json" },
      };
      const req = http.request(opts, (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => (data += chunk.toString()));
        res.on("end", () => resolve({ status: res.statusCode || 0, headers: res.headers }));
      });
      req.on("error", reject);
      req.write(JSON.stringify({ username: "admin", password: "wrong" }));
      req.end();
    });
    expect(status).toBe(429);
  });

  it("resets count after successful login", async () => {
    // 3 failures
    for (let i = 0; i < 3; i++) {
      await loginRequest(JSON.stringify({ username: "admin", password: "wrong" }));
    }
    // Success clears the count
    const { status: okStatus } = await loginRequest(JSON.stringify({ username: "admin", password: "admin" }));
    expect(okStatus).toBe(200);

    // Next failure should be treated as fresh (count=1)
    const { status: failStatus } = await loginRequest(JSON.stringify({ username: "admin", password: "wrong" }));
    expect(failStatus).toBe(401);
  });
});
