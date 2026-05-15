/**
 * 统一反检测脚本注入模块。
 *
 * 在所有 CDP Page 创建时自动注入，覆盖自动化特征，
 * 使 Playwright/CDP 连接达到与真实用户浏览器一致的指纹水平。
 */

const INJECTED_FLAG = "__wh_anti_detection_injected__";

/** 注入脚本字符串 — 在页面任何脚本执行之前运行 */
const SCRIPT = `
(() => {
  if (window.${INJECTED_FLAG}) return;
  Object.defineProperty(window, "${INJECTED_FLAG}", { value: true, writable: false });

  // ── 1. 隐藏自动化标志 ──
  Object.defineProperty(navigator, "webdriver", { get: () => false });

  // ── 2. 伪造 chrome.runtime ──
  if (window.chrome) {
    if (!window.chrome.runtime) {
      window.chrome.runtime = {
        id: "abc",
        connect: () => null,
        sendMessage: () => {},
        getManifest: () => ({}),
        getURL: (p) => p,
        onConnect: { addListener: () => {}, removeListener: () => {} },
        onMessage: { addListener: () => {}, removeListener: () => {} },
      };
    }
  }

  // ── 3. 模拟真实插件列表 ──
  var plugins = [
    { name: "Chrome PDF Plugin", filename: "internal-pdf-viewer", description: "Portable Document Format" },
    { name: "Chrome PDF Viewer", filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai", description: "" },
    { name: "Native Client", filename: "internal-nacl-plugin", description: "" },
  ];
  Object.defineProperty(navigator, "plugins", {
    get: () => ({
      length: plugins.length,
      item: function(i) { return plugins[i] || null; },
      namedItem: function(n) { return plugins.find(function(p) { return p.name === n; }) || null; },
      refresh: function() {},
      [Symbol.iterator]: function() { var i=0; return { next: function() { return i<plugins.length ? {value:plugins[i++],done:false} : {done:true}; }}; },
      ...Object.fromEntries(plugins.map(function(p,i) { return [i, p]; })),
    }),
  });

  // ── 4. 模拟 navigator.mimeTypes ──
  if (navigator.mimeTypes && navigator.mimeTypes.length === 0) {
    var mime = [
      { type: "application/pdf", suffixes: "pdf", description: "Portable Document Format" },
      { type: "text/pdf", suffixes: "pdf", description: "Portable Document Format" },
    ];
    Object.defineProperty(navigator, "mimeTypes", {
      get: () => ({
        length: mime.length,
        item: function(i) { return mime[i] || null; },
        namedItem: function(n) { return mime.find(function(m) { return m.type === n; }) || null; },
        [Symbol.iterator]: function() { var i=0; return { next: function() { return i<mime.length ? {value:mime[i++],done:false} : {done:true}; }}; },
        ...Object.fromEntries(mime.map(function(m,i) { return [i, m]; })),
      }),
    });
  }

  // ── 5. 覆盖 permissions.query ──
  if (navigator.permissions && navigator.permissions.query) {
    var origQuery = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = function(p) {
      if (p && p.name === "notifications") {
        return Promise.resolve({ state: "denied", onchange: null });
      }
      return origQuery(p);
    };
  }

  // ── 6. languages ──
  Object.defineProperty(navigator, "languages", { get: () => ["zh-CN", "zh", "en"] });

  // ── 7. platform ──
  Object.defineProperty(navigator, "platform", { get: () => "Win32" });

  // ── 8. hardwareConcurrency ──
  Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8 });

  // ── 9. deviceMemory ──
  Object.defineProperty(navigator, "deviceMemory", { get: () => 8 });

  // ── 10. 隐藏 Playwright/CDP 注入的 $cdc_ 标志 ──
  var keys = Object.getOwnPropertyNames(document);
  for (var k of keys) {
    if (k.startsWith("$cdc_") || k.startsWith("$")) {
      try { delete document[k]; } catch(e) {}
    }
  }

  // ── 11. outerWidth/outerHeight 一致性 ──
  var checkSize = function() {
    var w = window.innerWidth;
    var h = window.innerHeight;
    Object.defineProperty(window, "outerWidth", { get: function() { return w; }, configurable: true });
    Object.defineProperty(window, "outerHeight", { get: function() { return h; }, configurable: true });
  };
  checkSize();
  window.addEventListener("resize", checkSize);
})();
`;

/**
 * 向 Page 注入反检测脚本。
 * 每个 Page 只注入一次（通过标记防止重复）。
 */
export async function injectAntiDetection(page: any): Promise<void> {
  try {
    const already = await page.evaluate(() => {
      return !!(window as any).__wh_anti_detection_injected__;
    }).catch(() => false);
    if (already) return;
  } catch {}

  await page.addInitScript(SCRIPT).catch(() => {});
}

/**
 * 在 Page 已加载后强制应用反检测（额外覆盖）。
 * 用于已被导航过的空闲页。
 */
export async function applyAntiDetectionNow(page: any): Promise<void> {
  try {
    const already = await page.evaluate(() => {
      return !!(window as any).__wh_anti_detection_injected__;
    }).catch(() => false);
    if (already) return;
  } catch {}

  try {
    await page.evaluate(SCRIPT);
  } catch {}
}
