import { jest, describe, it, expect, afterEach } from "@jest/globals";

import { ConsoleLogger } from "../ConsoleLogger.js";
import { runWithLogContext } from "../../utils/log-context.js";

describe("ConsoleLogger", () => {
  it("outputs info", () => { const spy = jest.spyOn(console, "log").mockImplementation(() => {}); new ConsoleLogger("debug").info("test"); expect(spy).toHaveBeenCalled(); spy.mockRestore(); });
  it("outputs warn", () => { const spy = jest.spyOn(console, "warn").mockImplementation(() => {}); new ConsoleLogger("debug").warn("w"); expect(spy).toHaveBeenCalled(); spy.mockRestore(); });
  it("outputs error", () => { const spy = jest.spyOn(console, "error").mockImplementation(() => {}); new ConsoleLogger("debug").error("e"); expect(spy).toHaveBeenCalled(); spy.mockRestore(); });
  it("includes traceId", () => { const spy = jest.spyOn(console, "log").mockImplementation(() => {}); const l = new ConsoleLogger("debug"); l.setTraceId("abc"); l.info("t"); expect(spy.mock.calls[0][0]).toContain("[abc]"); spy.mockRestore(); });
  it("includes module", () => { const spy = jest.spyOn(console, "log").mockImplementation(() => {}); const l = new ConsoleLogger("debug"); l.setModule("mod"); l.info("t"); expect(spy.mock.calls[0][0]).toContain("[mod]"); spy.mockRestore(); });
  it("async context traceId", async () => { const spy = jest.spyOn(console, "log").mockImplementation(() => {}); await runWithLogContext({ traceId: "async-trace" }, () => { new ConsoleLogger("debug").info("t"); }); expect(spy.mock.calls[0][0]).toContain("[async-trace]"); spy.mockRestore(); });
});

describe("level filtering", () => {
  const orig = { ...process.env };
  afterEach(() => { process.env.WH_LOG_LEVEL = orig.WH_LOG_LEVEL; process.env.WH_LOG_DEBUG_MODULES = orig.WH_LOG_DEBUG_MODULES; jest.restoreAllMocks(); });
  it("WH_LOG_LEVEL=error suppresses info", () => { process.env.WH_LOG_LEVEL = "error"; const spy = jest.spyOn(console, "log").mockImplementation(() => {}); new ConsoleLogger("test").info("x"); expect(spy).not.toHaveBeenCalled(); spy.mockRestore(); });
  it("WH_LOG_DEBUG_MODULES overrides global level", () => { process.env.WH_LOG_LEVEL = "warn"; process.env.WH_LOG_DEBUG_MODULES = "DebugMod"; const spy = jest.spyOn(console, "debug").mockImplementation(() => {}); new ConsoleLogger("DebugMod").debug("x"); expect(spy).toHaveBeenCalled(); spy.mockRestore(); });
});
