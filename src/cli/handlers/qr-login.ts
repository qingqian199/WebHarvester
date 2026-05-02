import inquirer from "inquirer";
import { FileSessionManager } from "../../adapters/FileSessionManager";
import { BrowserLifecycleManager } from "../../adapters/BrowserLifecycleManager";
import { captureSessionFromPage } from "../../utils/session-helper";
import { PAGE_LOAD_FALLBACK_TIMEOUT_MS, LOGIN_FORM_WAIT_MS, LOGIN_SUCCESS_POLL_MS, MANUAL_LOGIN_TIMEOUT_MS } from "../../core/constants/GlobalConstant";
import { CliDeps, CliAction } from "../types";

export async function handleQrLogin(deps: CliDeps, action: CliAction): Promise<void> {
  const sessionManager = new FileSessionManager();
  const lcm = new BrowserLifecycleManager(deps.logger);
  const autoSave = deps.config.auth?.qrLoginAutoSave ?? process.argv.includes("--auto-save");

  console.log("\n📱 扫码登录模式");
  console.log("正在打开浏览器...\n");

  try {
    const page = await lcm.launch(action.loginUrl || "", false, undefined, "domcontentloaded", MANUAL_LOGIN_TIMEOUT_MS);
    await page.waitForLoadState("load", { timeout: PAGE_LOAD_FALLBACK_TIMEOUT_MS }).catch(() => {});
    await page.waitForTimeout(LOGIN_FORM_WAIT_MS);

    await page.evaluate(() => {
      const keywords = ["登录", "登入"];
      const allEls = document.querySelectorAll<HTMLElement>("a, button, div, span, li");
      for (const el of allEls) {
        if (el.offsetWidth === 0 || el.offsetHeight === 0) continue;
        const text = el.textContent?.trim().toLowerCase() || "";
        if (keywords.some((k) => text === k)) { el.click(); return; }
      }
    });
    await page.waitForTimeout(LOGIN_FORM_WAIT_MS);

    console.log("========================================");
    console.log("📱 请使用手机 App 扫描屏幕上的二维码登录");
    console.log("💡 登录完成后在浏览器中确认，然后回到此处继续");
    if (!autoSave) console.log("⏎ 扫码完成后按 Enter 键继续...");
    console.log("========================================\n");

    if (autoSave) {
      const AUTH_COOKIE_KEYWORDS = ["session", "token", "sid", "sess", "passport"];
      const h = async () => { await new Promise((r) => setTimeout(r, LOGIN_SUCCESS_POLL_MS)); };
      const hasAuthCookie = async () => {
        const cookies = await page.context().cookies();
        return cookies.some((c) => AUTH_COOKIE_KEYWORDS.some((w) => c.name.toLowerCase().includes(w)));
      };
      const hasSessionCookie = async () => {
        const cookies = await page.context().cookies();
        return cookies.some((c) => ["sessdata", "sessionid", "token", "passport"].some((k) => c.name.toLowerCase().includes(k)));
      };
      const start = Date.now();
      let loggedIn = false;
      while (Date.now() - start < MANUAL_LOGIN_TIMEOUT_MS) {
        await h();
        try {
          const currentUrl = page.url().split("?")[0];
          if (currentUrl !== (action.loginUrl || "").split("?")[0]) {
            for (let i = 0; i < 10; i++) {
              await new Promise((r) => setTimeout(r, 500));
              if (await hasAuthCookie()) { loggedIn = true; break; }
            }
            if (loggedIn) break;
          }
          if (await hasSessionCookie()) { loggedIn = true; break; }
        } catch {}
      }
      if (!loggedIn) throw new Error("扫码登录超时");
    } else {
      await inquirer.prompt([{ type: "input", name: "_", message: "扫码完成后按 Enter 继续...", default: "" }]);
    }

    const session = await captureSessionFromPage(page, page.context());

    let userName = "";
    try { userName = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>(".user-name, .header-user-name, [class*=username]");
      return el?.textContent?.trim() || document.title?.split("-")[0]?.trim() || "";
    }); } catch {}

    const domain = new URL(action.loginUrl || "").hostname;

    console.log("\n═══════════════════════════════════");
    console.log("📱 检测到扫码登录");
    console.log(`  站点: ${domain}`);
    if (userName) console.log(`  用户: ${userName}`);
    else console.log("  🔑 已检测到登录凭证");
    console.log("═══════════════════════════════════\n");

    const { confirm } = await inquirer.prompt([{
      type: "confirm", name: "confirm",
      message: `是否保存此会话为 [${action.profile}]？`,
      default: true,
    }]);
    if (confirm) {
      await sessionManager.save(action.profile || "default", session);
      console.log(`✅ 会话已保存为 [${action.profile}]`);
    } else {
      console.log("⏭️ 已放弃保存会话");
    }
  } catch (e) {
    deps.logger.error("扫码登录失败", { err: (e as Error).message });
    if (!(e as Error).message.includes("超时")) console.log("❌ 扫码登录失败:", (e as Error).message);
  } finally {
    await lcm.close();
  }
}
