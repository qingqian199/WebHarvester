import { Router } from "../Router";

export function registerBrowserRoutes(router: Router, _ctx: any): void {
  router.register("GET", "/api/browser/health", async (req, res) => {
    try {
      const { getChromeServiceHealth, getChromeServiceStatus } = await import("../../utils/chrome-service-bridge");
      const health = getChromeServiceHealth();
      const status = getChromeServiceStatus();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: 0, data: { health, status } }));
    } catch {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: 0, data: { health: null, status: "ChromeService 不可用" } }));
    }
  });
}
