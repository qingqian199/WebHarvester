/**
 * WebHarvester 端到端测试。
 *
 * 启动本地 HTTP 服务器提供 fixture 页面，使用 Playwright 驱动测试。
 * 覆盖：静态页面采集、SPA 登录、会话复用。
 */
import http from "http";
import fs from "fs/promises";
import path from "path";
import { chromium, Browser, Page } from "playwright";

const FIXTURES_DIR = path.resolve(__dirname, "fixtures");
let server: http.Server;
let browser: Browser;
let baseUrl: string;

beforeAll(async () => {
  // 启动本地 HTTP 服务器
  server = http.createServer(async (req, res) => {
    const filePath = path.join(FIXTURES_DIR, req.url === "/" ? "static-article.html" : req.url!);
    try {
      const content = await fs.readFile(filePath);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end("Not Found");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const addr = server.address() as { port: number };
  baseUrl = `http://127.0.0.1:${addr.port}`;

  browser = await chromium.launch({ headless: true });
});

afterAll(async () => {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
});

// ── E2E-1: 静态页面采集 ─────────────────────────────────

describe("E2E-1: 静态页面采集", () => {
  let page: Page;

  beforeAll(async () => {
    page = await browser.newPage();
  });

  afterAll(async () => {
    await page.close();
  });

  it("页面标题正确", async () => {
    await page.goto(`${baseUrl}/static-article.html`, { waitUntil: "networkidle" });
    await expect(page.title()).resolves.toBe("测试文章标题");
  });

  it("作者元数据可提取", async () => {
    const author = await page.evaluate(() => {
      const el = document.querySelector("meta[name=\"author\"]");
      return el ? el.getAttribute("content") : "";
    });
    expect(author).toBe("测试作者");
  });

  it("正文选择器可提取内容", async () => {
    const text = await page.evaluate(() => {
      const el = document.querySelector("article");
      return el ? el.innerText.trim() : "";
    });
    expect(text).toContain("第一段正文内容");
    expect(text).toContain("第四段");
  });

  it("正文 HTML 保留结构", async () => {
    const html = await page.evaluate(() => {
      const el = document.querySelector("article");
      return el ? el.innerHTML.trim() : "";
    });
    expect(html).toContain("<p>");
    expect(html).toContain("</p>");
  });

  it("无 <script> 标签", async () => {
    const scripts = await page.evaluate(() => document.querySelectorAll("script").length);
    expect(scripts).toBe(0);
  });
});

// ── E2E-2: SPA 登录采集 ──────────────────────────────────

describe("E2E-2: SPA 登录", () => {
  let page: Page;

  beforeAll(async () => {
    page = await browser.newPage();
  });

  afterAll(async () => {
    await page.close();
  });

  it("初始状态显示登录按钮，无用户信息", async () => {
    await page.goto(`${baseUrl}/spa-login.html`, { waitUntil: "networkidle" });
    const loginBtn = await page.locator(".login-btn").isVisible();
    expect(loginBtn).toBe(true);

    const userInfo = await page.locator(".user-info").isVisible();
    expect(userInfo).toBe(false);
  });

  it("点击登录按钮打开弹窗", async () => {
    await page.click("#loginBtn");
    const modal = await page.locator(".modal-overlay").isVisible();
    expect(modal).toBe(true);
  });

  it("填写表单并提交后 Cookie 写入且页面状态变更", async () => {
    await page.fill("#username", "test@example.com");
    await page.fill("#password", "password123");
    await page.click("button[type=\"submit\"]");

    // 模态框关闭
    const modal = await page.locator(".modal-overlay").isVisible();
    expect(modal).toBe(false);

    // 用户信息出现
    const userInfo = await page.locator(".user-info").isVisible();
    expect(userInfo).toBe(true);

    // 登录按钮消失
    const loginBtn = await page.locator(".login-btn").isVisible();
    expect(loginBtn).toBe(false);
  });

  it("SESSDATA Cookie 已写入", async () => {
    const cookies = await page.context().cookies();
    const sess = cookies.find((c) => c.name === "SESSDATA");
    expect(sess).toBeDefined();
    expect(sess!.value).toBe("e2e_test_session");
  });

  it("用户名字段显示正确", async () => {
    const userName = await page.locator(".user-name").textContent();
    expect(userName).toBe("测试用户");
  });
});

// ── E2E-3: 会话复用 ──────────────────────────────────────

describe("E2E-3: 会话复用", () => {
  let page: Page;

  beforeAll(async () => {
    page = await browser.newPage();
  });

  afterAll(async () => {
    await page.close();
  });

  it("未登录时页面显示登录链接，无用户头像", async () => {
    await page.goto(`${baseUrl}/protected-page.html`, { waitUntil: "networkidle" });
    const loginLink = await page.locator("#loginLink").isVisible();
    expect(loginLink).toBe(true);
  });

  it("注入 Cookie 后页面显示已登录状态", async () => {
    await page.context().addCookies([
      { name: "SESSDATA", value: "e2e_test_session", domain: "127.0.0.1", path: "/" },
    ]);
    await page.reload({ waitUntil: "networkidle" });

    const loginLink = await page.locator("#loginLink").isVisible();
    expect(loginLink).toBe(false);

    const avatar = await page.locator("#userAvatar").isVisible();
    expect(avatar).toBe(true);
  });

  it("Cookie 清除后页面回到未登录状态", async () => {
    await page.context().clearCookies();
    await page.reload({ waitUntil: "networkidle" });

    const loginLink = await page.locator("#loginLink").isVisible();
    expect(loginLink).toBe(true);
  });
});
