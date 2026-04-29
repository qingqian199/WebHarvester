const DANGEROUS_APIS = [
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "document.cookie",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "window.open",
  "window.close",
  "navigator.sendBeacon"
];

export function sanitizePageScript(rawScript: string): string {
  let safeCode = rawScript;

  DANGEROUS_APIS.forEach(api => {
    const reg = new RegExp(api, "gi");
    safeCode = safeCode.replace(reg, `__disabled_${api}`);
  });

  safeCode = safeCode.replace(/eval\s*\(/gi, "(void 0)/*eval_disabled*/(");
  safeCode = safeCode.replace(/new\s+Function/gi, "void Function");

  return `
    ;(function(){
      'use strict';
      ${safeCode}
    })();
  `;
}

export function isHighRiskScript(rawScript: string): boolean {
  const riskReg = /fetch|xhr|cookie|storage|websocket|eval|new\s+Function/gi;
  return riskReg.test(rawScript);
}
