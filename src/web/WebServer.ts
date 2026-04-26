import http from "http";
import fs from "fs/promises";
import path from "path";
import { ConsoleLogger } from "../adapters/ConsoleLogger";
import { HarvesterService } from "../core/services/HarvesterService";
import { BatchHarvestService } from "../services/BatchHarvestService";
import { PlaywrightAdapter } from "../adapters/PlaywrightAdapter";
import { FileStorageAdapter } from "../adapters/FileStorageAdapter";
import { loadAppConfig } from "../utils/config-loader";
import { loadBatchTasks } from "../utils/batch-loader";

export class WebServer {
  private server: http.Server | null = null;
  private readonly port = 3000;
  private readonly logger = new ConsoleLogger();

  async start() {
    this.server = http.createServer(async (req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      if (req.url === "/" || req.url === "/index.html") return this.serveStatic(res, "static/index.html", "text/html");
      if (req.url === "/style.css") return this.serveStatic(res, "static/style.css", "text/css");
      if (req.url === "/api.js") return this.serveStatic(res, "static/api.js", "application/javascript");

      if (req.url === "/api/run") {
        const buf: Buffer[] = [];
        for await (const chunk of req) buf.push(chunk);
        const body = JSON.parse(Buffer.concat(buf).toString());
        try {
          const cfg = await loadAppConfig();
          const browser = new PlaywrightAdapter(this.logger);
          const storage = new FileStorageAdapter(cfg.outputDir);
          const svc = new HarvesterService(this.logger, browser, storage);
          await svc.harvest({ targetUrl: body.url });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ code: 0, msg: "采集完成" }));
        } catch (e) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ code: -1, msg: (e as Error).message }));
        }
        return;
      }

      if (req.url === "/api/batch") {
        try {
          const cfg = await loadAppConfig();
          const { tasks } = await loadBatchTasks();
          const browser = new PlaywrightAdapter(this.logger);
          const storage = new FileStorageAdapter(cfg.outputDir);
          const batch = new BatchHarvestService(this.logger, browser, storage);
          await batch.runBatch(tasks);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ code: 0, msg: "批量完成" }));
        } catch (e) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ code: -1, msg: (e as Error).message }));
        }
        return;
      }

      res.writeHead(404);
      res.end("Not Found");
    });

    this.server.listen(this.port, () => {
      this.logger.info(`🌐 可视化面板：http://localhost:${this.port}`);
    });
  }

  private async serveStatic(res: http.ServerResponse, p: string, mime: string) {
    try {
      const c = await fs.readFile(path.resolve(p));
      res.writeHead(200, { "Content-Type": mime });
      res.end(c);
    } catch {
      res.writeHead(404);
      res.end("File Not Found");
    }
  }

  stop() {
    this.server?.close();
  }
}
