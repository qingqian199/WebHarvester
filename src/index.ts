import inquirer from "inquirer";
import * as readline from "readline";
import { loadAppConfig } from "./utils/config-loader";
import { ConsoleLogger } from "./adapters/ConsoleLogger";
import { PlaywrightAdapter } from "./adapters/PlaywrightAdapter";
import { FileStorageAdapter } from "./adapters/FileStorageAdapter";
import { HarvesterService } from "./core/services/HarvesterService";
import { BatchHarvestService } from "./services/BatchHarvestService";
import { loadBatchTasks } from "./utils/batch-loader";
import { WebServer } from "./web/WebServer";
import { FileSessionManager } from "./adapters/FileSessionManager";
import { FeatureFlags } from "./core/features";
import { startMainMenu, runAnalyzeFromMenu } from "./cli/main-menu";
import { AuthGuard } from "./utils/auth-guard";
import { LoginOracle } from "./utils/login-oracle";
import { SessionState } from "./core/ports/ISessionManager";

let activeWebServer: WebServer | null = null;

function registerShutdown() {
  const handle = async () => {
    console.log("\n\n⚠️  正在优雅关闭...");
    if (activeWebServer) {
      activeWebServer.stop();
      activeWebServer = null;
    }
    process.exit(0);
  };
  process.on("SIGINT", handle);
  process.on("SIGTERM", handle);
}

async function bootstrap() {
  registerShutdown();

  console.log(`
=============================================
  WebHarvester 逆向采集工具  v1.1.0
  低硬件适配 | 模块化解耦 | 工程化架构
=============================================
  `);

  const appCfg = await loadAppConfig();
  const logger = new ConsoleLogger();

  let running = true;
  while (running) {
    const action = await startMainMenu();

    if (action.type === "exit") {
      console.log("👋 再见！");
      running = false;
      break;
    }

    if (action.type === "login") {
      const sessionManager = new FileSessionManager();
      const oracle = new LoginOracle(sessionManager, logger);

      const intel = await oracle.gatherIntel(action.loginUrl);

      console.log("\n📋 登录情报分析结果：");
      console.log(`   登录接口：${intel.formAction || "未自动探测到，将使用表单提交"}`);
      console.log(`   用户名字段：${intel.paramMap.username}`);
      console.log(`   密码字段：${intel.paramMap.password}`);
      console.log(`   验证码：${intel.captchaRequired ? "需要" : "无需"}`);

      if (intel.captchaRequired) {
        console.log("\n⚠️ 检测到验证码，暂不支持自动登录。建议使用 web 面板手动登录。\n");
        continue;
      }

      const { username, password } = await inquirer.prompt([
        { type: "input", name: "username", message: "请输入用户名/邮箱：" },
        { type: "password", name: "password", message: "请输入密码：" }
      ]);

      const session = await oracle.executeLogin(
        action.loginUrl,
        action.verifyUrl,
        intel,
        username,
        password,
        action.profile
      );

      if (session) {
        console.log(`✅ 登录成功！会话已保存为 [${action.profile}]`);
      } else {
        console.log("❌ 自动登录失败，请检查账号密码或手动操作");
      }
      console.log("");
      continue;
    }

    if (action.type === "analyze") {
      await runAnalyzeFromMenu();
      continue;
    }

    if (action.type === "web") {
      const web = new WebServer(logger);
      activeWebServer = web;
      await web.start();
      console.log("\n🌍 Web 面板已启动：http://localhost:3000");
      console.log("按 Enter 键停止面板并返回主菜单...\n");

      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      await new Promise<void>((resolve) => rl.question("", () => resolve()));
      rl.close();

      web.stop();
      activeWebServer = null;
      console.log("Web 面板已停止。\n");
      continue;
    }

    if (action.type === "batch") {
      const { tasks, concurrency } = await loadBatchTasks();
      if (tasks.length === 0) {
        console.log("⚠️ tasks.json 中没有任务，请先配置。\n");
        continue;
      }
      const batch = new BatchHarvestService(logger, appCfg.outputDir, concurrency);
      await batch.runBatch(tasks);
      console.log("");
      continue;
    }

    if (action.type === "single") {
      const sessionManager = new FileSessionManager();
      let sessionState: SessionState | null = null;

      if (action.profile && FeatureFlags.enableSessionPersist) {
        const verifyUrl = appCfg.auth?.verifyUrl || action.config.targetUrl;
        const loginUrl = appCfg.auth?.loginUrl || action.config.targetUrl;

        const authGuard = new AuthGuard(sessionManager);
        sessionState = await authGuard.ensureAuth(
          action.profile,
          loginUrl,
          verifyUrl
        );
        if (!sessionState) {
          console.log("❌ 无法获取有效登录会话，取消本次采集\n");
          continue;
        }
      }

      const browser = new PlaywrightAdapter(logger);
      const storage = new FileStorageAdapter(appCfg.outputDir);
      const svc = new HarvesterService(logger, browser, storage);
      await svc.harvest(
        action.config,
        "all",
        action.saveSession,
        sessionManager,
        action.profile,
        sessionState ?? undefined
      );
      console.log("");
    }
  }
}

bootstrap().catch((err) => {
  console.error("程序异常：", (err as Error).message);
  process.exit(1);
});
