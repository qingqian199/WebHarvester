import { ConsoleLogger } from "./ConsoleLogger";

describe("ConsoleLogger", () => {
  let spyDebug: jest.SpyInstance;
  let spyLog: jest.SpyInstance;
  let spyWarn: jest.SpyInstance;
  let spyError: jest.SpyInstance;

  beforeEach(() => {
    spyDebug = jest.spyOn(console, "debug").mockImplementation(() => {});
    spyLog = jest.spyOn(console, "log").mockImplementation(() => {});
    spyWarn = jest.spyOn(console, "warn").mockImplementation(() => {});
    spyError = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("level filtering", () => {
    it("debug level outputs all levels", () => {
      const log = new ConsoleLogger("debug");
      log.debug("d"); log.info("i"); log.warn("w"); log.error("e");
      expect(spyDebug).toHaveBeenCalledWith(expect.stringMatching(/\[DEBUG\].* d/));
      expect(spyLog).toHaveBeenCalledWith(expect.stringMatching(/\[INFO\].* i/));
      expect(spyWarn).toHaveBeenCalledWith(expect.stringMatching(/\[WARN\].* w/));
      expect(spyError).toHaveBeenCalledWith(expect.stringMatching(/\[ERROR\].* e/));
    });

    it("info level suppresses debug", () => {
      const log = new ConsoleLogger("info");
      log.debug("d"); log.info("i");
      expect(spyDebug).not.toHaveBeenCalled();
      expect(spyLog).toHaveBeenCalled();
    });

    it("warn level suppresses debug and info", () => {
      const log = new ConsoleLogger("warn");
      log.debug("d"); log.info("i"); log.warn("w");
      expect(spyDebug).not.toHaveBeenCalled();
      expect(spyLog).not.toHaveBeenCalled();
      expect(spyWarn).toHaveBeenCalled();
    });

    it("error level only outputs error", () => {
      const log = new ConsoleLogger("error");
      log.info("i"); log.warn("w"); log.error("e");
      expect(spyLog).not.toHaveBeenCalled();
      expect(spyWarn).not.toHaveBeenCalled();
      expect(spyError).toHaveBeenCalled();
    });

    it("defaults to info when level is invalid", () => {
      const log = new ConsoleLogger("invalid");
      log.debug("d"); log.info("i");
      expect(spyDebug).not.toHaveBeenCalled();
      expect(spyLog).toHaveBeenCalled();
    });

    it("defaults to info when no level given", () => {
      const log = new ConsoleLogger();
      log.debug("d"); log.info("i");
      expect(spyDebug).not.toHaveBeenCalled();
      expect(spyLog).toHaveBeenCalled();
    });
  });

  describe("format", () => {
    it("includes message in output", () => {
      const log = new ConsoleLogger("debug");
      log.info("hello");
      expect(spyLog).toHaveBeenCalledWith(expect.stringMatching(/hello/));
    });

    it("includes meta as JSON when provided", () => {
      const log = new ConsoleLogger("debug");
      log.info("test", { key: "val" });
      expect(spyLog).toHaveBeenCalledWith(expect.stringMatching(/"key":"val"/));
    });

    it("omits meta when not provided", () => {
      const log = new ConsoleLogger("debug");
      log.info("plain");
      const call = spyLog.mock.calls[0][0] as string;
      expect(call).not.toContain("\"");
    });
  });
});
