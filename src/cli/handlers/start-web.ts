import * as readline from "readline";
import { CliDeps } from "../types";
import { WebServer } from "../../web/WebServer";

let activeWebServer: WebServer | null = null;

export async function handleStartWeb(deps: CliDeps): Promise<void> {
  const web = new WebServer(deps.logger);
  activeWebServer = web;
  await web.start();
  console.log("\n🌍 Web 面板已启动：http://localhost:3000");
  console.log("按 Enter 键停止面板并返回主菜单...\n");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise<void>((resolve) => rl.question("", () => resolve()));
  rl.close();

  web.stop();
  activeWebServer = null;
  deps.logger.info("Web 面板已停止");
}

export function stopActiveWebServer(): void {
  if (activeWebServer) {
    activeWebServer.stop();
    activeWebServer = null;
  }
}
