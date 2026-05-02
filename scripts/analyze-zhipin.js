const fs = require('fs'), path = require('path');
const dir = 'output/www_zhipin_com';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && !f.includes('anti-crawl'));
files.sort();
const d = JSON.parse(fs.readFileSync(path.join(dir,files[files.length-1]), 'utf-8'));

console.log('=== Full Capture Analysis: BOSS Zhipin ===');
console.log('targetUrl:', d.targetUrl);
console.log('total requests:', d.networkRequests.length);

// Cookie analysis
console.log('\n=== STORAGE (Cookies) ===');
const cookies = d.storage?.cookies || [];
cookies.forEach(c => console.log('  ' + c.name + ' = ' + (c.value||'').substring(0,60)));

// HTML framework
console.log('\n=== FRAMEWORK DETECTION ===');
const doc = d.networkRequests.find(r => r.resourceType === 'document');
if (doc && doc.responseBody) {
  const html = doc.responseBody;
  const detections = [
    ['Vue.js', 'vue'],
    ['React', 'react'],
    ['Next.js', '__NEXT_DATA__'],
    ['Webpack', 'webpack'],
    ['jQuery', 'jquery'],
    ['Axios', 'axios'],
    ['Element UI', 'element-ui'],
    ['Ant Design', 'antd'],
    ['i18n', 'i18n'],
  ];
  detections.forEach(([name, sig]) => {
    if (html.includes(sig)) console.log('  [found] ' + name);
  });
  // Script tags
  const scriptMatches = html.match(/src="([^"]+\.(js|css)[^"]*)"/g);
  if (scriptMatches) {
    console.log('\n  Key static resources:');
    scriptMatches.slice(0,20).forEach(s => console.log('    ' + s));
  }
  // Chunk IDs (webpack)
  const chunks = html.match(/chunk-[a-zA-Z0-9]+/g);
  if (chunks) console.log('  Webpack chunks:', [...new Set(chunks)].slice(0,10).join(', '));
}

// API pattern analysis
console.log('\n=== API PATTERNS ===');
const apis = d.networkRequests.filter(r => r.responseBody && typeof r.responseBody === 'string' && r.responseBody.trim().startsWith('{'));
apis.forEach(r => {
  try {
    const u = new URL(r.url);
    const body = JSON.parse(r.responseBody);
    const code = body.code;
    const msg = body.message || body.msg || '';
    const hasZPData = body.zpData !== undefined;
    console.log(`  ${r.method} ${u.pathname} code=${code} ${msg.substring(0,30)} size=${r.responseBody.length}B zpData=${hasZPData}`);
  } catch(e) {
    console.log(`  ${r.method} (parse error) ${r.url.substring(0,100)}`);
  }
});

// Security mechanisms
console.log('\n=== SECURITY / ANTI-CRAWL ===');
d.networkRequests.filter(r => r.url.includes('security') || r.url.includes('captcha') || r.url.includes('finger') || r.url.includes('zppassport')).forEach(r => {
  const body = r.responseBody ? r.responseBody.substring(0,200) : '(no body)';
  console.log(`  ${r.method} ${r.url.split('?')[0].substring(0,80)}`);
  console.log('    ' + body.replace(/\n/g, ' ').trim());
});

// traceid analysis
console.log('\n=== TRACE ID ===');
apiReqs = d.networkRequests.filter(r => r.url.includes('traceid='));
apiReqs.forEach(r => {
  const m = r.url.match(/traceid=([a-f0-9]+)/);
  if (m) console.log('  traceid=' + m[1].substring(0,24) + '...  ' + r.method + ' ' + r.url.split('?')[0].substring(0,70));
});

// Header analysis for a few API calls
console.log('\n=== SAMPLE REQUEST HEADERS ===');
const sample = d.networkRequests.find(r => r.url.includes('cityGroup'));
if (sample && sample.requestHeaders) {
  Object.entries(sample.requestHeaders).forEach(([k,v]) => console.log('  ' + k + ': ' + (typeof v === 'string' ? v.substring(0,80) : v)));
}

// GET vs POST breakdown
console.log('\n=== API METHOD BREAKDOWN ===');
const methods = {};
d.networkRequests.filter(r => r.url.includes('zhipin') && !r.url.includes('.js') && !r.url.includes('.css')).forEach(r => {
  const u = new URL(r.url);
  const key = r.method + ' ' + u.pathname.split('/').slice(0,4).join('/');
  methods[key] = (methods[key]||0) + 1;
});
Object.entries(methods).sort().forEach(([k,v]) => console.log(`  ${k} (${v} calls)`));

// Login/deauth patterns
console.log('\n=== AUTHENTICATION PATTERNS ===');
d.networkRequests.filter(r => r.url.includes('getUserInfo') || r.url.includes('passport') || r.url.includes('login') || r.url.includes('set/zpToken')).forEach(r => {
  console.log(`  ${r.method} ${r.url.split('?')[0]} -> ${r.responseBody ? r.responseBody.substring(0,200) : '(no body)'}`);
});
