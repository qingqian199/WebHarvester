import { WebServer } from "../WebServer";
import { ConsoleLogger } from "../../adapters/ConsoleLogger";
import { FileSessionManager } from "../../adapters/FileSessionManager";

describe("WebServer JWT auth", () => {
  let server: WebServer;
  let listenPort: number;
  let baseUrl: string;

  beforeAll(async () => {
    listenPort = 0; // let OS assign
    const logger = new ConsoleLogger("error");
    const sm = new FileSessionManager();
    server = new WebServer(logger, sm, 0);

    // start on random port
    await server.start(0);

    // wait for server to listen and get port
    await new Promise<void>((resolve) => {
      const check = () => {
        const addr = (server as any).server?.address();
        if (addr) {
          listenPort = addr.port;
          baseUrl = `http://127.0.0.1:${listenPort}`;
          resolve();
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });
  }, 15000);

  afterAll(() => {
    server.stop();
  });

  it("returns 401 for unauthenticated API request", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe(-1);
  });

  it("accepts login with correct credentials", async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "admin" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.code).toBe(0);
    expect(body.data.token).toBeTruthy();
  });

  it("rejects login with wrong password", async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "wrong" }),
    });
    expect(res.status).toBe(401);
  });

  it("accepts API request with valid token", async () => {
    // Login first
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "admin" }),
    });
    const { data } = await loginRes.json();
    const token = data.token;

    // Access API with token
    const res = await fetch(`${baseUrl}/api/health`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  it("rejects API request with expired or invalid token", async () => {
    const res = await fetch(`${baseUrl}/api/health`, {
      headers: { Authorization: "Bearer invalid-token" },
    });
    expect(res.status).toBe(401);
  });

  it("OPTIONS request does not require auth", async () => {
    const res = await fetch(`${baseUrl}/api/health`, { method: "OPTIONS" });
    expect(res.status).toBe(204);
  });
});
