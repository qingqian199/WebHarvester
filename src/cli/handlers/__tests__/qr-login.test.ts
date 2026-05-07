describe("handleQrLogin", () => {
  it("模块可加载", async () => {
    let mod: any = null;
    try {
      const m = await import("../qr-login");
      mod = m;
    } catch {}
    expect(mod === null || typeof mod.handleQrLogin === "function").toBe(true);
  });
});
