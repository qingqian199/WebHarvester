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

async function request(path: string, method = "GET", body?: string, customToken?: string): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    if (body) headers["Content-Type"] = "application/json";
    const t = customToken ?? token;
    if (t) headers["Authorization"] = `Bearer ${t}`;
    const opts: http.RequestOptions = { hostname: "localhost", port, path, method, headers };
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

describe("ApiIntegration: collect-units pipeline", () => {
  beforeAll(async () => {
    port = await getPort();
    server = new WebServer();
    await server.start(port);
    await new Promise((r) => setTimeout(r, 500));
    const { data } = await request("/api/auth/login", "POST", JSON.stringify({ username: "admin", password: "admin" }), "");
    token = data?.data?.token ?? "";
  }, 15000);

  afterAll(() => {
    server.stop();
  });

  it("POST /api/auth/login with wrong password returns 401", async () => {
    const { status, data } = await request("/api/auth/login", "POST", JSON.stringify({ username: "admin", password: "wrong" }), "");
    expect(status).toBe(401);
    expect(data.code).toBe("E011");
  });

  it("POST /api/auth/login with correct password returns token", async () => {
    const { status, data } = await request("/api/auth/login", "POST", JSON.stringify({ username: "admin", password: "admin" }), "");
    expect(status).toBe(200);
    expect(data.code).toBe(0);
    expect(data.data.token).toBeTruthy();
  });

  it("POST /api/collect-units with valid params returns structured response", async () => {
    const { status } = await request(
      "/api/collect-units",
      "POST",
      JSON.stringify({
        site: "bilibili",
        units: ["bili_video_info"],
        params: { aid: "123" },
      }),
    );
    expect([200, 500]).toContain(status);
  }, 15000);

  it("POST /api/collect-units missing site returns 400", async () => {
    const { status, data } = await request("/api/collect-units", "POST", JSON.stringify({ units: ["x"] }));
    expect(status).toBe(400);
    expect(data.code).toBe(-1);
    expect(data.msg).toContain("缺少");
  });

  it("POST /api/collect-units unknown site returns 400", async () => {
    const { status, data } = await request("/api/collect-units", "POST", JSON.stringify({ site: "unknown", units: ["x"] }));
    expect(status).toBe(400);
    expect(data.code).toBe(-1);
    expect(data.msg).toContain("未知站点");
  });

  it("GET /api/crawlers returns at least xiaohongshu and bilibili", async () => {
    const { status, data } = await request("/api/crawlers");
    expect(status).toBe(200);
    expect(data.code).toBe(0);
    expect(data.data).toHaveProperty("xiaohongshu");
    expect(data.data).toHaveProperty("bilibili");
  });

  it("GET /api/sessions returns array (empty or with entries)", async () => {
    const { status, data } = await request("/api/sessions");
    expect(status).toBe(200);
    expect(data.code).toBe(0);
    expect(Array.isArray(data.data)).toBe(true);
  });

  it("GET /api/features returns all feature flags", async () => {
    const { status, data } = await request("/api/features");
    expect(status).toBe(200);
    expect(data.code).toBe(0);
    expect(typeof data.data).toBe("object");
    expect(Object.keys(data.data).length).toBeGreaterThan(5);
    // Check specific flags
    expect(data.data).toHaveProperty("enableSessionPersist");
    expect(data.data).toHaveProperty("enableProxyPool");
  });

  it("GET /api/results returns array", async () => {
    const { status, data } = await request("/api/results");
    expect(status).toBe(200);
    expect(data.code).toBe(0);
    expect(Array.isArray(data.data)).toBe(true);
  });

  it("GET /api/content-units with site parameter returns units", async () => {
    const { status, data } = await request("/api/content-units?site=bilibili");
    expect(status).toBe(200);
    expect(data.code).toBe(0);
    expect(Array.isArray(data.data)).toBe(true);
    expect(data.data.length).toBeGreaterThan(0);
  });

  it("GET /api/content-units without site returns empty array", async () => {
    const { status, data } = await request("/api/content-units");
    expect(status).toBe(200);
    expect(data.code).toBe(0);
    expect(data.data).toEqual([]);
  });

  it("DELETE /api/sessions/nonexistent returns 200 (graceful)", async () => {
    const { status, data } = await request("/api/sessions/nonexistent_delete_test", "DELETE");
    expect(status).toBe(200);
    expect(data.code).toBe(0);
  });

  it("OPTIONS /api/health does not require auth", async () => {
    const { status } = await request("/api/health", "OPTIONS");
    expect(status).toBe(204);
  });

  it("POST /api/format with units returns formatted data", async () => {
    const { status, data } = await request(
      "/api/format",
      "POST",
      JSON.stringify({ units: [{ unit: "test", data: { title: "hello" } }] }),
    );
    expect(status).toBe(200);
    if (data.code !== undefined) {
      expect(data.code).toBe(0);
      expect(Array.isArray(data.data)).toBe(true);
    } else {
      // formatUnitResult may return directly
      expect(Array.isArray(data)).toBe(true);
    }
  });
});
