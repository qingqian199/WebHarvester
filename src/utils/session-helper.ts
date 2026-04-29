import { Page, BrowserContext } from "playwright";
import { SessionState } from "../core/ports/ISessionManager";

export async function captureSessionFromPage(
  page: Page,
  context: BrowserContext
): Promise<SessionState> {
  const cookies = await context.cookies();

  const localData = await page.evaluate(() => {
    const data: Record<string, string> = {};
    const store = window.localStorage;
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i)!;
      data[key] = store.getItem(key) || "";
    }
    return data;
  });

  const sessionData = await page.evaluate(() => {
    const data: Record<string, string> = {};
    const store = window.sessionStorage;
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i)!;
      data[key] = store.getItem(key) || "";
    }
    return data;
  });

  return {
    cookies,
    localStorage: localData,
    sessionStorage: sessionData,
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
  };
}
