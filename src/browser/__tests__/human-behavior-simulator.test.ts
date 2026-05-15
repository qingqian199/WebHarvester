import { simulateHumanScroll, simulateMouseMovement, simulateRandomClick, simulateTyping, humanBehaviorSession } from "../human-behavior-simulator";

// Mock a minimal Page-like object
function mockPage(): any {
  const callLog: string[] = [];
  const safeFn = (name: string, impl?: any) => {
    const fn = async (...args: any[]) => {
      callLog.push(`${name}(${args.map((a: any) => typeof a === "string" ? `"${a.slice(0, 30)}"` : String(a)).join(",")})`);
      if (impl) return impl(...args);
    };
    return Object.assign(fn, { _mockName: name });
  };

  return {
    _callLog: callLog,
    mouse: {
      move: safeFn("mouse.move"),
      wheel: safeFn("mouse.wheel"),
      click: safeFn("mouse.click"),
    },
    keyboard: {
      type: safeFn("keyboard.type"),
      press: safeFn("keyboard.press"),
    },
    click: safeFn("page.click"),
    $: async (sel: string) => {
      callLog.push(`$("${sel}")`);
      if (sel === ".exists") return { boundingBox: async () => ({ x: 100, y: 200, width: 50, height: 30 }) };
      if (sel === ".paragraph") return { boundingBox: async () => ({ x: 0, y: 0, width: 500, height: 100 }) };
      return null;
    },
    $$: async (sel: string) => {
      callLog.push(`$$("${sel}")`);
      return [{ boundingBox: async () => ({ x: 0, y: 0, width: 100, height: 20 }) }];
    },
    viewportSize: () => ({ width: 1280, height: 720 }),
    boundingBox: async () => null,
  };
}

describe("human-behavior-simulator", () => {
  jest.setTimeout(10000);

  describe("simulateHumanScroll", () => {
    it("calls mouse.wheel at least twice", async () => {
      const page = mockPage();
      await simulateHumanScroll(page as any, { maxScrolls: 2, delayRange: [10, 20] });
      const wheelCalls = page._callLog.filter((l: string) => l.startsWith("mouse.wheel"));
      expect(wheelCalls.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("simulateMouseMovement", () => {
    it("moves mouse to random coordinates", async () => {
      const page = mockPage();
      await simulateMouseMovement(page as any, undefined, { steps: 3, delayRange: [10, 20] });
      const moveCalls = page._callLog.filter((l: string) => l.startsWith("mouse.move"));
      expect(moveCalls.length).toBeGreaterThanOrEqual(3);
    });

    it("moves to target element when selector given", async () => {
      const page = mockPage();
      await simulateMouseMovement(page as any, ".exists", { steps: 3, delayRange: [10, 20] });
      expect(page._callLog.some((l: string) => l.startsWith("$(\".exists\")"))).toBe(true);
    });
  });

  describe("simulateRandomClick", () => {
    it("clicks on target element", async () => {
      const page = mockPage();
      await simulateRandomClick(page as any, ".exists");
      expect(page._callLog.some((l: string) => l.startsWith("$(\".exists\")"))).toBe(true);
    });
  });

  describe("simulateTyping", () => {
    it("types text character by character", async () => {
      const page = mockPage();
      await simulateTyping(page as any, ".input", "hello", { wpm: 200, typoRate: 0 }); // fast wpm, no typos
      const typeCalls = page._callLog.filter((l: string) => l.startsWith("keyboard.type(\"h") || l.startsWith("keyboard.type(\"e"));
      expect(typeCalls.length).toBeGreaterThan(0);
    });
  });

  describe("humanBehaviorSession", () => {
    it("light: performs scrolls", async () => {
      const page = mockPage();
      await humanBehaviorSession(page as any, "light");
      expect(page._callLog.some((l: string) => l.startsWith("mouse.wheel"))).toBe(true);
    });

    it("medium: performs scrolls + mouse moves", async () => {
      const page = mockPage();
      await humanBehaviorSession(page as any, "medium");
      expect(page._callLog.some((l: string) => l.startsWith("mouse.move"))).toBe(true);
    });

    it("off: does nothing", async () => {
      const page = mockPage();
      await humanBehaviorSession(page as any, "off");
      expect(page._callLog.length).toBe(0);
    });

    it("heavy: performs scrolls + moves + hover", async () => {
      const page = mockPage();
      await humanBehaviorSession(page as any, "heavy");
      expect(page._callLog.some((l: string) => l.startsWith("mouse.wheel"))).toBe(true);
    });
  });
});
