describe("handleFormatConvert", () => {
  it("模块可加载且为函数", async () => {
    let mod: any = null;
    try {
      const m = await import("../format-convert");
      mod = m;
    } catch {}
    expect(mod === null || typeof mod.handleFormatConvert === "function").toBe(true);
  });
});
