import { RoundRobinProxyProvider, ProbeFn } from "./RoundRobinProxyProvider";
import { ProxyConfig } from "../core/ports/IProxyProvider";

function makeProxies(): ProxyConfig[] {
  return [
    { host: "fast-proxy", port: 8080, protocol: "http" },
    { host: "medium-proxy", port: 8080, protocol: "http" },
    { host: "slow-proxy", port: 8080, protocol: "http" },
    { host: "dead-proxy", port: 8080, protocol: "http" },
  ];
}

/** Helper: create a controllable probe function. */
function controllableProbe(results: Map<string, { success: boolean; latencyMs: number }>): ProbeFn {
  return async (proxy) => {
    const key = `${proxy.host}:${proxy.port}`;
    const r = results.get(key) ?? { success: true, latencyMs: 500 };
    return r;
  };
}

describe("RoundRobinProxyProvider", () => {
  it("returns null when disabled", async () => {
    const p = new RoundRobinProxyProvider({ enabled: false, proxies: [{ host: "127.0.0.1", port: 8080, protocol: "http" }] });
    expect(await p.getProxy()).toBeNull();
  });

  it("returns null when no proxies configured", async () => {
    const p = new RoundRobinProxyProvider({ enabled: true, proxies: [] });
    expect(await p.getProxy()).toBeNull();
  });

  it("reports enabled correctly", () => {
    const p = new RoundRobinProxyProvider({ enabled: true, proxies: [{ host: "127.0.0.1", port: 8080, protocol: "http" }] });
    expect(p.enabled).toBe(true);
    const p2 = new RoundRobinProxyProvider();
    expect(p2.enabled).toBe(false);
  });

  describe("warmup", () => {
    it("marks fast proxies as available and dead proxies as unavailable", async () => {
      const results = new Map<string, { success: boolean; latencyMs: number }>();
      results.set("fast-proxy:8080", { success: true, latencyMs: 200 });
      results.set("medium-proxy:8080", { success: true, latencyMs: 1500 });
      results.set("slow-proxy:8080", { success: true, latencyMs: 3000 });
      results.set("dead-proxy:8080", { success: false, latencyMs: 6000 });

      const p = new RoundRobinProxyProvider(
        { enabled: true, proxies: makeProxies() },
        controllableProbe(results),
      );
      await p.warmup();

      expect(p.enabledCount).toBe(3);
      expect(p.listProxies().map(x => x.host).sort()).toEqual(["fast-proxy", "medium-proxy", "slow-proxy"]);

      const health = p.getHealth();
      expect(health.get("http://fast-proxy:8080")?.weight).toBe(3);
      expect(health.get("http://medium-proxy:8080")?.weight).toBe(2);
      expect(health.get("http://slow-proxy:8080")?.weight).toBe(1);
      expect(health.get("http://dead-proxy:8080")?.available).toBe(false);
    });

    it("does nothing when disabled", async () => {
      const p = new RoundRobinProxyProvider({ enabled: false, proxies: [] });
      await p.warmup();
      expect(p.enabledCount).toBe(0);
    });
  });

  describe("weighted getProxy", () => {
    it("selects high-weight proxies more often", async () => {
      const results = new Map<string, { success: boolean; latencyMs: number }>();
      results.set("fast-proxy:8080", { success: true, latencyMs: 200 });    // weight 3
      results.set("medium-proxy:8080", { success: true, latencyMs: 1500 }); // weight 2
      results.set("slow-proxy:8080", { success: true, latencyMs: 3000 });   // weight 1
      results.set("dead-proxy:8080", { success: false, latencyMs: 6000 });

      const p = new RoundRobinProxyProvider(
        { enabled: true, proxies: makeProxies() },
        controllableProbe(results),
      );
      await p.warmup();
      expect(p.enabledCount).toBe(3);

      const counts: Record<string, number> = { "fast-proxy": 0, "medium-proxy": 0, "slow-proxy": 0 };
      const N = 1000;
      for (let i = 0; i < N; i++) {
        const proxy = await p.getProxy();
        if (proxy) counts[proxy.host]++;
      }

      // fast-proxy (weight 3) should be selected more than slow-proxy (weight 1)
      expect(counts["fast-proxy"]).toBeGreaterThan(counts["slow-proxy"] * 1.5);
      expect(counts["medium-proxy"]).toBeGreaterThan(counts["slow-proxy"] * 1.2);
      // sum should equal N
      const total = counts["fast-proxy"] + counts["medium-proxy"] + counts["slow-proxy"];
      expect(total).toBe(N);
    });

    it("returns null if all proxies are unavailable", async () => {
      const results = new Map<string, { success: boolean; latencyMs: number }>();
      results.set("fast-proxy:8080", { success: false, latencyMs: 6000 });

      const p = new RoundRobinProxyProvider(
        { enabled: true, proxies: [{ host: "fast-proxy", port: 8080, protocol: "http" }] },
        controllableProbe(results),
      );
      await p.warmup();
      expect(await p.getProxy()).toBeNull();
    });
  });

  describe("reportFailure", () => {
    it("decreases weight on each failure", async () => {
      const p = new RoundRobinProxyProvider({
        enabled: true,
        proxies: [{ host: "p1", port: 8080, protocol: "http" }],
      });
      const proxy = { host: "p1", port: 8080, protocol: "http" as const };
      expect(p.getHealth().get("http://p1:8080")?.weight).toBe(1);

      p.reportFailure(proxy, new Error("e1"));
      expect(p.getHealth().get("http://p1:8080")?.weight).toBe(1); // min 1

      // With weight 1 and 3 consecutive failures → move to unavailable
      p.reportFailure(proxy, new Error("e2"));
      p.reportFailure(proxy, new Error("e3"));
      expect(p.enabledCount).toBe(0);
      expect(p.listAllProxies()).toHaveLength(1);
    });

    it("does not affect other proxies", async () => {
      const p = new RoundRobinProxyProvider({
        enabled: true,
        proxies: [
          { host: "p1", port: 8080, protocol: "http" },
          { host: "p2", port: 8080, protocol: "http" },
        ],
      });
      p.reportFailure({ host: "p1", port: 8080, protocol: "http" }, new Error("e"));
      expect(p.enabledCount).toBe(2); // p2 is unaffected
    });
  });

  describe("health check", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it("demotes available proxy after 2 consecutive health check failures", async () => {
      const results = new Map<string, { success: boolean; latencyMs: number }>();
      results.set("p1:8080", { success: true, latencyMs: 500 });

      // After warmup: p1 is available
      const p = new RoundRobinProxyProvider(
        { enabled: true, proxies: [{ host: "p1", port: 8080, protocol: "http" }] },
        controllableProbe(results),
      );
      await p.warmup();
      expect(p.enabledCount).toBe(1);

      // Now make health checks fail
      results.set("p1:8080", { success: false, latencyMs: 6000 });

      // First health check run
      await p["runHealthCheck"]();
      expect(p.enabledCount).toBe(1); // still available (1 failure < 2)

      // Second health check run → demoted
      await p["runHealthCheck"]();
      expect(p.enabledCount).toBe(0);

      p.destroy();
    });

    it("promotes unavailable proxy after 2 consecutive health check successes", async () => {
      const results = new Map<string, { success: boolean; latencyMs: number }>();
      results.set("p1:8080", { success: false, latencyMs: 6000 });

      const p = new RoundRobinProxyProvider(
        { enabled: true, proxies: [{ host: "p1", port: 8080, protocol: "http" }] },
        controllableProbe(results),
      );
      await p.warmup();
      expect(p.enabledCount).toBe(0); // unavailable after warmup

      // Now make health checks succeed
      results.set("p1:8080", { success: true, latencyMs: 500 });

      // First health check
      await p["runHealthCheck"]();
      expect(p.enabledCount).toBe(0); // still unavailable (1 success < 2)

      // Second health check → promoted
      await p["runHealthCheck"]();
      expect(p.enabledCount).toBe(1);

      p.destroy();
    });
  });

  describe("startHealthCheck / stopHealthCheck", () => {
    it("startHealthCheck returns this for chaining", () => {
      const p = new RoundRobinProxyProvider({ enabled: true, proxies: [] });
      expect(p.startHealthCheck()).toBe(p);
      p.stopHealthCheck();
    });
  });

  describe("listAllProxies & getHealth", () => {
    it("listAllProxies returns all proxies", () => {
      const p = new RoundRobinProxyProvider({
        enabled: true,
        proxies: [{ host: "p1", port: 8080, protocol: "http" }],
      });
      p.reportFailure({ host: "p1", port: 8080, protocol: "http" }, new Error("e"));
      p.reportFailure({ host: "p1", port: 8080, protocol: "http" }, new Error("e"));
      p.reportFailure({ host: "p1", port: 8080, protocol: "http" }, new Error("e"));
      const all = p.listAllProxies();
      expect(all).toHaveLength(1);
      expect(all[0].host).toBe("p1");
    });

    it("getHealth returns a copy of health map", () => {
      const p = new RoundRobinProxyProvider({
        enabled: true,
        proxies: [{ host: "p1", port: 8080, protocol: "http" }],
      });
      const h = p.getHealth();
      expect(h.has("http://p1:8080")).toBe(true);
      h.delete("http://p1:8080");
      expect(p.getHealth().size).toBe(1); // original unaffected
    });
  });

  describe("resetFailures", () => {
    it("clears consecutive failure counts", () => {
      const p = new RoundRobinProxyProvider({
        enabled: true,
        proxies: [{ host: "p1", port: 8080, protocol: "http" }],
      });
      p.reportFailure({ host: "p1", port: 8080, protocol: "http" }, new Error("e"));
      expect(p.getHealth().get("http://p1:8080")?.consecutiveFailures).toBe(1);
      p.resetFailures();
      expect(p.getHealth().get("http://p1:8080")?.consecutiveFailures).toBe(0);
    });
  });
});
