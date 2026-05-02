import http from "http";
import net from "net";
import { WebServer } from "../WebServer";

let port: number;
let server: WebServer;
let token: string;

function getPort(): Promise<number> {
  return new Promise((res) => {
    const s = net.createServer();
    s.listen(0, () => {
      const p = (s.address() as any).port;
      s.close(() => res(p));
    });
  });
}

async function request(path: string, method = "GET", body?: string, customToken?: string): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    if (body) headers["Content-Type"] = "application/json";
    const t = customToken ?? token;
    if (t) headers["Authorization"] = `Bearer ${t}`;
    const opts: http.RequestOptions = {
      hostname: "localhost",
      port,
      path,
      method,
      headers,
    };
    const req = http.request(opts, (res) => {
      let data = "";
      res.on("data", (chunk: Buffer) => (data += chunk.toString()));
      res.on("end", () => {
        let parsed: any;
        try { parsed = JSON.parse(data); } catch { parsed = data; }
        resolve({ status: res.statusCode || 0, data: parsed });
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

/** 登录并获取 token */
async function login(): Promise<string> {
  const { data } = await request("/api/auth/login", "POST", JSON.stringify({ username: "admin", password: "admin" }), "");
  return data?.data?.token ?? "";
}

describe("WebServer", () => {
  beforeAll(async () => {
    port = await getPort();
    server = new WebServer();
    await server.start(port);
    // wait for server to be ready
    await new Promise((r) => setTimeout(r, 500));
    token = await login();
  }, 15000);

  afterAll(() => {
    server.stop();
  });

  it("GET /health returns correct JSON structure (no auth required)", async () => {
    const { status, data } = await request("/health", "GET");
    expect(status).toBe(200);
    expect(data.status).toBe("ok");
    expect(typeof data.uptime).toBe("number");
  });

  it("GET /api/health requires auth", async () => {
    const { status } = await request("/api/health", "GET", undefined, "");
    expect(status).toBe(401);
  });

  it("GET /api/health works with auth", async () => {
    const { status } = await request("/api/health");
    expect(status).toBe(200);
  });

  it("GET /api/results returns result list", async () => {
    const { status, data } = await request("/api/results");
    expect(status).toBe(200);
    expect(data.code).toBe(0);
    expect(Array.isArray(data.data)).toBe(true);
  });

  it("GET /api/sessions returns session list", async () => {
    const { status, data } = await request("/api/sessions");
    expect(status).toBe(200);
    expect(data.code).toBe(0);
    expect(Array.isArray(data.data)).toBe(true);
  });

  it("POST /api/collect-units missing required fields returns 400", async () => {
    const { status, data } = await request("/api/collect-units", "POST", JSON.stringify({}));
    expect(status).toBe(400);
    expect(data.code).toBe(-1);
    expect(data.msg).toContain("缺少");
  });

  it("GET /api/content-units missing site returns empty array", async () => {
    const { status, data } = await request("/api/content-units");
    expect(status).toBe(200);
    expect(data.code).toBe(0);
    expect(data.data).toEqual([]);
  });

  it("GET /api/crawlers returns crawler config", async () => {
    const { status, data } = await request("/api/crawlers");
    expect(status).toBe(200);
    expect(data.code).toBe(0);
    expect(typeof data.data).toBe("object");
  });

  it("GET / returns HTML (no auth required)", async () => {
    const { status, data } = await request("/");
    expect(status).toBe(200);
    expect(typeof data).toBe("string");
  });

  it("unknown path returns 404", async () => {
    const { status } = await request("/nonexistent");
    expect(status).toBe(404);
  });
});
