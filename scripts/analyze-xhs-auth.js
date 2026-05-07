const d=JSON.parse(require('fs').readFileSync('output/www_xiaohongshu_com/harvest-mopqx69v_c3krrcoh.json','utf-8'));
console.log('=== 基本信息 ===');
console.log('targetUrl:', d.targetUrl);
console.log('traceId:', d.traceId);
console.log('总请求数:', d.networkRequests.length);
console.log('');

// 检查 Cookie
const storage = d.storage || {};
console.log('=== Cookie (' + (storage.cookies||[]).length + '个) ===');
(storage.cookies||[]).forEach(c => console.log('  ' + c.name + '=' + c.value.slice(0,50) + (c.domain ? ' (' + c.domain + ')' : '') + (c.httpOnly ? ' HttpOnly' : '') + (c.secure ? ' Secure' : '')));

console.log('');
console.log('=== localStorage (' + Object.keys(storage.localStorage||{}).length + '个) ===');
const ls = storage.localStorage || {};
Object.entries(ls).slice(0,15).forEach(([k,v]) => console.log('  ' + k + '=' + String(v).slice(0,80)));

console.log('');
console.log('=== sessionStorage (' + Object.keys(storage.sessionStorage||{}).length + '个) ===');
const ss = storage.sessionStorage || {};
Object.entries(ss).slice(0,5).forEach(([k,v]) => console.log('  ' + k + '=' + String(v).slice(0,80)));

// 检查 analysis
const analysis = d.analysis || {};
console.log('');
console.log('=== analysis.authInfo ===');
console.log(JSON.stringify(analysis.authInfo, null, 2).slice(0,500));

// 检查 API 请求中的认证头
console.log('');
console.log('=== 关键 API 请求 (auth) ===');
const authReqs = d.networkRequests.filter(r => {
  try { const u = new URL(r.url); return u.hostname === 'edith.xiaohongshu.com' && r.resourceType === 'xhr'; } catch { return false; }
});
authReqs.slice(0,5).forEach(r => {
  const u = new URL(r.url);
  const cookies = r.requestHeaders?.['Cookie'] || '';
  const webSession = cookies.includes('web_session');
  console.log('[' + r.method + '] ' + u.pathname);
  console.log('  Cookie长度:', cookies.length, '字, 含web_session:', webSession);
  console.log('  Cookie前50:', cookies.slice(0,50));
  console.log('');
});
