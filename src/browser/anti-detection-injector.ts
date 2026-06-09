/**
 * 统一反检测脚本注入模块�? *
 * 在每�?CDP Page 创建时自动注入，覆盖自动化特征，
 * �?Playwright/CDP 连接达到与真实用户浏览器一致的指纹水平�? *
 * 覆盖向量�? * - navigator.webdriver / plugins / mimeTypes / languages / platform
 * - chrome.runtime
 * - Canvas fingerprint (subtle noise)
 * - WebGL vendor/renderer override
 * - AudioContext fingerprint (noise injection)
 * - WebRTC IP 防泄�? * - $cdc_ 标记清理
 * - permissions.query
 * - deviceMemory / hardwareConcurrency
 */

const INJECTED_FLAG = "__wh_anti_detection_injected__";

const SCRIPT = `
(() => {
  if (window.${INJECTED_FLAG}) return;
  Object.defineProperty(window, "${INJECTED_FLAG}", { value: true, writable: false });

  // ── 1. 隐藏自动化标�?──
  Object.defineProperty(navigator, "webdriver", { get: () => false });

  // ── 2. 伪�?chrome.runtime ──
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

  // ── 6. languages / platform / 硬件信息 ──
  Object.defineProperty(navigator, "languages", { get: () => ["zh-CN", "zh", "en"] });
  Object.defineProperty(navigator, "platform", { get: () => "Win32" });
  Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8 });
  Object.defineProperty(navigator, "deviceMemory", { get: () => 8 });

  // ── 7. 隐藏 Playwright/CDP 注入�?$cdc_ / $ 标记 ──
  var keys = Object.getOwnPropertyNames(document);
  for (var k of keys) {
    if (k.startsWith("$cdc_") || (k.startsWith("$") && k !== "$")) {
      try { delete document[k]; } catch(e) {}
    }
  }

  // ── 8. outerWidth / outerHeight �?inner 保持同步 ──
  var checkSize = function() {
    var w = window.innerWidth;
    var h = window.innerHeight;
    Object.defineProperty(window, "outerWidth", { get: function() { return w; }, configurable: true });
    Object.defineProperty(window, "outerHeight", { get: function() { return h; }, configurable: true });
  };
  checkSize();
  window.addEventListener("resize", checkSize);

  // ── 9. Canvas 指纹随机化（�?getImageData 输出注入亚像素噪声） ──
  var origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
  CanvasRenderingContext2D.prototype.getImageData = function() {
    var imageData = origGetImageData.apply(this, arguments);
    // 仅在 15% 概率注入微小噪声，避免被识别为固定修�?    if (Math.random() < 0.15) {
      var channels = 4; // RGBA
      // 只改第一个像素的 R 通道 ±1，最小化视觉影响
      var noise = Math.random() < 0.5 ? 1 : -1;
      imageData.data[0] = Math.min(255, Math.max(0, imageData.data[0] + noise));
    }
    return imageData;
  };

  // ── 10. WebGL 厂商/渲染器覆盖（�?GPU 指纹追踪�?──
  var getExt = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type, attrs) {
    if (type === "webgl" || type === "experimental-webgl") {
      attrs = Object.assign({}, attrs || {}, {
        failIfMajorPerformanceCaveat: true,
        preserveDrawingBuffer: false,
      });
    }
    var ctx = getExt.call(this, type, attrs);
    if (ctx && (type === "webgl" || type === "experimental-webgl")) {
      var origGetParam = ctx.getParameter.bind(ctx);
      ctx.getParameter = function(p) {
        // UNMASKED_VENDOR_WEBGL = 0x9245, UNMASKED_RENDERER_WEBGL = 0x9246
        if (p === 0x9245) return "Intel Inc.";
        if (p === 0x9246) return "Intel Iris OpenGL Engine";
        return origGetParam(p);
      };
      // 覆盖 getExtension 以修�?WEBGL_debug_renderer_info
      var origGetExt = ctx.getExtension.bind(ctx);
      ctx.getExtension = function(name) {
        var ext = origGetExt(name);
        if (ext && name === "WEBGL_debug_renderer_info") {
          ext.UNMASKED_VENDOR_WEBGL = 0x9245;
          ext.UNMASKED_RENDERER_WEBGL = 0x9246;
        }
        return ext;
      };
    }
    return ctx;
  };

  // ── 11. AudioContext 指纹随机�?──
  var OrigAudioCtx = window.AudioContext || window.webkitAudioContext;
  if (OrigAudioCtx) {
    var AudioCtxProxy = function() {
      var ctx = new OrigAudioCtx();
      // 劫持 createAnalyser 以微调频域数据，注入一个不可感知的偏移
      var origCreateAnalyser = ctx.createAnalyser.bind(ctx);
      ctx.createAnalyser = function() {
        var analyser = origCreateAnalyser();
        var origGetFloat = analyser.getFloatFrequencyData.bind(analyser);
        analyser.getFloatFrequencyData = function(arr) {
          origGetFloat(arr);
          // 低频段注�?±0.3dB 噪声（人类不可感知）
          var len = Math.min(arr.length, 8);
          for (var i = 0; i < len; i++) {
            var noise = (Math.random() - 0.5) * 0.6;
            arr[i] = arr[i] + noise;
          }
        };
        var origGetByte = analyser.getByteFrequencyData.bind(analyser);
        analyser.getByteFrequencyData = function(arr) {
          origGetByte(arr);
          var len = Math.min(arr.length, 8);
          for (var i = 0; i < len; i++) {
            var noise = Math.floor((Math.random() - 0.5) * 2);
            arr[i] = Math.min(255, Math.max(0, arr[i] + noise));
          }
        };
        return analyser;
      };
      return ctx;
    };
    AudioCtxProxy.prototype = OrigAudioCtx.prototype;
    try {
      window.AudioContext = AudioCtxProxy;
      if (window.webkitAudioContext) window.webkitAudioContext = AudioCtxProxy;
    } catch(e) {}
  }

  // ── 12. WebRTC IP 防泄漏（非侵入式：防�?enumerateDevices 暴露精确标签�?──
  if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
    var origEnumerate = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
    navigator.mediaDevices.enumerateDevices = function() {
      return origEnumerate().then(function(devices) {
        return devices.map(function(d) {
          // 模糊化设备标签，除非用户已授�?          if (d.label && d.label !== "") {
            var kind = d.kind === "audioinput" ? "Microphone" : d.kind === "audiooutput" ? "Speaker" : d.kind === "videoinput" ? "Camera" : "Device";
            var genericLabel = kind + " (" + d.deviceId.slice(0, 8) + "...)";
            return Object.assign({}, d, { label: genericLabel });
          }
          return d;
        });
      });
    };
  }
})();
`;

/** 反检测配置接�?*/
export interface AntiDetectionConfig {
  /** 是否启用 Canvas 指纹噪声（默�?true�?*/
  canvasNoise?: boolean;
  /** 是否启用 WebGL 厂商覆盖（默�?true�?*/
  webglOverride?: boolean;
  /** 是否启用 AudioContext 指纹噪声（默�?true�?*/
  audioNoise?: boolean;
  /** 是否启用 WebRTC 设备标签模糊化（默认 true�?*/
  webRtcProtect?: boolean;
  /** 自定义平台（默认 Win32�?*/
  platform?: string;
  /** 语言列表（默�?["zh-CN","zh","en"]�?*/
  languages?: string[];
  /** 硬件并发数（默认 8�?*/
  hardwareConcurrency?: number;
  /** 设备内存 GB（默�?8�?*/
  deviceMemory?: number;
}

/** 根据配置生成自定义注入脚本（目前使用内置模板，后续可支持配置化） */
export function buildScript(_config?: Partial<AntiDetectionConfig>): string {
  // 当前内置脚本已覆盖所有功能，配置化模板暂用同一份
  return SCRIPT;
}

/**
 * �?Page 注入反检测脚本�? * 每个 Page 只注入一次（通过标记防重复）�? */
export async function injectAntiDetection(page: any, _config?: Partial<AntiDetectionConfig>): Promise<void> {
  try {
    const already = await page
      .evaluate(() => {
        return !!(window as any).__wh_anti_detection_injected__;
      })
      .catch(() => false);
    if (already) return;
  } catch (e) {
    console.warn("[anti-detection] inject check error:", (e as Error).message);
  }

  await page.addInitScript(SCRIPT).catch((e: Error) => console.warn("[anti-detection] addInitScript error:", e.message));
}

/**
 * 在 Page 已加载后强制应用反检测（额外覆盖）。
 * 用于已被导航过的空闲页。
 */
export async function applyAntiDetectionNow(page: any): Promise<void> {
  try {
    const already = await page
      .evaluate(() => {
        return !!(window as any).__wh_anti_detection_injected__;
      })
      .catch(() => false);
    if (already) return;
  } catch (e) {
    console.warn("[anti-detection] inject check error:", (e as Error).message);
  }

  try {
    await page.evaluate(SCRIPT);
  } catch (e) {
    console.warn("[anti-detection] evaluate error:", (e as Error).message);
  }
}

export { SCRIPT, INJECTED_FLAG };
export default { injectAntiDetection, applyAntiDetectionNow, buildScript, SCRIPT };
