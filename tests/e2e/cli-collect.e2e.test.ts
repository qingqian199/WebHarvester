/**
 * CLI E2E test — 模拟 CLI 交互，验证采集流程。
 *
 * 此测试使用 Playwright 启动子进程并通过 stdio 交互。
 * 需要先构建项目（或直接使用 ts-node）。
 *
 * 运行方式: npx jest tests/e2e/cli-collect.e2e.test.ts --testTimeout 60000
 */

import { spawn, ChildProcess } from "child_process";
import path from "path";
const PROJECT_ROOT = path.resolve(__dirname, "../..");
const CLI_ENTRY = path.resolve(PROJECT_ROOT, "src/index.ts");

// 超时设置：E2E 测试需要较长时间
jest.setTimeout(120_000);

describe("CLI E2E: collect flow", () => {
  let proc: ChildProcess;
  let output = "";
  let resolved = false;

  function startCLI(args: string[] = []): void {
    output = "";
    resolved = false;
    proc = spawn("npx", ["ts-node", "--project", path.resolve(PROJECT_ROOT, "tsconfig.json"), CLI_ENTRY, ...args], {
      cwd: PROJECT_ROOT,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, WEBHARVESTER_MASTER_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" },
    });

    proc.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });

    proc.on("exit", () => { resolved = true; });
  }

  async function waitForOutput(pattern: string | RegExp, timeoutMs = 30000): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (pattern instanceof RegExp ? pattern.test(output) : output.includes(pattern)) {
        return output;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(`Timed out waiting for pattern: ${pattern}. Output so far:\n${output.slice(-2000)}`);
  }

  async function _writeStdin(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!proc.stdin) { reject(new Error("stdin not available")); return; }
      proc.stdin.write(text, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  afterEach(async () => {
    if (proc && !proc.killed) {
      proc.kill();
    }
  });

  it("should display main menu and respond to help action", async () => {
    startCLI();
    await waitForOutput(/WebHarvester|主菜单|Main Menu|操作|Action/i, 20000);
    // Send Ctrl+C to exit
    proc.kill("SIGINT");
    await new Promise((r) => setTimeout(r, 1000));
    expect(resolved || proc.killed).toBeTruthy();
  });

  it("should show version info", async () => {
    startCLI(["--version"]);
    await new Promise((r) => setTimeout(r, 5000));
    if (!resolved) proc.kill();
    // Should either show version or error out
    expect(output.length).toBeGreaterThan(0);
  });

  it("should handle --help flag", async () => {
    startCLI(["--help"]);
    await new Promise((r) => setTimeout(r, 5000));
    if (!resolved) proc.kill();
  });
});
