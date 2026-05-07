const d=JSON.parse(require('fs').readFileSync('output/www_xiaohongshu_com/harvest-mop9189i_0j9nc7n3.json','utf-8'));
console.log('=== 基本信息 ===');
console.log('traceId:', d.traceId);
console.log('targetUrl:', d.targetUrl);
console.log('总请求数:', d.networkRequests.length);
console.log('');

const apis = d.networkRequests.filter(r => r.url.includes('edith.xiaohongshu.com/api'));
console.log('=== 业务API (' + apis.length + '个) ===');
apis.forEach(r => {
  const u = new URL(r.url);
  const body = r.requestBody ? JSON.stringify(r.requestBody).slice(0,200) : '';
  const resp = typeof r.responseBody === 'string' ? r.responseBody.slice(0,200) : '';
  console.log('[' + r.method + '] ' + u.pathname);
  if (body) console.log('  body:', body);
  if (resp) console.log('  resp:', resp);
  console.log('');
});

const cookies = d.storage?.cookies || [];
console.log('=== Cookie (' + cookies.length + '个) ===');
cookies.forEach(c => console.log('  ' + c.name + '=' + (c.value||'').slice(0,40)));

const jsVars = d.jsVariables || {};
const keys = Object.keys(jsVars);
console.log('\n=== JS变量 (' + keys.length + '个) ===');
keys.slice(0,8).forEach(k => console.log('  ' + k + ':', JSON.stringify(jsVars[k]).slice(0,120)));
