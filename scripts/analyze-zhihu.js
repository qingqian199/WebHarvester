const d=JSON.parse(require('fs').readFileSync('output/www_zhihu_com/harvest-mopfz4l6_0f3ve4l0.json','utf-8'));
console.log('=== 基本信息 ===');
console.log('traceId:', d.traceId);
console.log('targetUrl:', d.targetUrl);
console.log('总请求数:', d.networkRequests.length);
console.log('');

const apis = d.networkRequests.filter(r => {
  try {
    const u = new URL(r.url);
    return u.hostname.includes('zhihu.com') && (r.resourceType === 'xhr' || r.resourceType === 'fetch');
  } catch { return false; }
});
console.log('=== XHR/Fetch API (' + apis.length + '个) ===');
apis.forEach(r => {
  try {
    const u = new URL(r.url);
    const body = r.requestBody ? JSON.stringify(r.requestBody).slice(0,150) : '';
    const resp = typeof r.responseBody === 'string' ? r.responseBody.slice(0,200) : '';
    console.log('[' + r.method + '] ' + u.pathname);
    const params = [...u.searchParams.entries()].map(([k,v]) => k+'='+v.slice(0,40)).join('&');
    if (params) console.log('  params:', params);
    if (body) console.log('  body:', body);
    if (resp) console.log('  resp:', resp);
    console.log('');
  } catch {}
});

const cookies = d.storage?.cookies || [];
const relevant = cookies.filter(c => ['session', 'token', 'z_c0', 'd_c0', 'q_c1'].some(k => c.name.toLowerCase().includes(k)));
console.log('=== 关键Cookie (' + relevant.length + '个) ===');
relevant.forEach(c => console.log('  ' + c.name + '=' + c.value.slice(0,30)));
