function log(text) {
  const box = document.getElementById("logBox");
  box.innerHTML += `[${new Date().toLocaleTimeString()}] ${text}\n`;
  box.scrollTop = box.scrollHeight;
}

function switchTab(tabId) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById(tabId).classList.add('active');
}

window.onload = async () => {
  await refreshProfileSelect();
  await loadCrawlers();
  await loadResultFiles();
  await fetchHealth();
  await loadSessionCards();
  setInterval(fetchHealth, 10000);
  document.getElementById('collectMode').onchange = () => {
    document.getElementById('crawlerSelectRow').style.display =
      document.getElementById('collectMode').value === 'crawler' ? 'flex' : 'none';
  };
};

// ── 通用 ──

async function api(path, opts) {
  const res = await fetch(path, opts);
  return res.json();
}

// ── Tab 1: 采集任务 ──

async function refreshProfileSelect() {
  try {
    const data = await api('/api/profiles');
    const select = document.getElementById('profileSelect');
    select.innerHTML = '<option value="">不使用登录状态</option>';
    (data.data || []).forEach(p => { select.innerHTML += `<option value="${p}">${p}</option>`; });
  } catch {}
}

async function loadCrawlers() {
  try {
    const data = await api('/api/crawlers');
    const sel = document.getElementById('crawlerSelect');
    sel.innerHTML = '';
    const enabled = Object.entries(data.data || {}).filter(([,v]) => v === 'enabled');
    if (enabled.length === 0) { sel.innerHTML = '<option>无已启用爬虫</option>'; return; }
    enabled.forEach(([k]) => { sel.innerHTML += `<option value="${k}">${k}</option>`; });
  } catch {}
}

async function startCollect() {
  const mode = document.getElementById('collectMode').value;
  const url = document.getElementById('urlInput').value.trim();
  if (!url) return alert('请输入网址');
  const profile = document.getElementById('profileSelect').value;

  log(`🔍 开始${mode === 'crawler' ? '特化' : '通用'}采集：${url}`);
  try {
    if (mode === 'crawler') {
      const site = document.getElementById('crawlerSelect').value;
      const res = await api('/api/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, profile, crawlerSite: site })
      });
      log(res.code === 0 ? '✅ 特化采集完成' : '❌ ' + res.msg);
    } else {
      const res = await api('/api/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, profile })
      });
      log(res.code === 0 ? '✅ 采集完成，报告已输出至 output 目录' : '❌ ' + res.msg);
    }
    await loadResultFiles();
  } catch { log('❌ 接口请求异常'); }
}

// ── Tab 2: 会话管理 ──

async function loadSessionCards() {
  try {
    const data = await api('/api/sessions');
    const container = document.getElementById('sessionCards');
    const list = data.data || [];
    if (list.length === 0) { container.innerHTML = '<p style="color:#888;">暂无已存会话</p>'; return; }
    container.innerHTML = list.map(s => {
      const valid = s.status === 'valid';
      const border = valid ? '#22c55e' : '#ef4444';
      return `<div class="card" style="border-left:4px solid ${border};">
        <div class="card-title">${s.name}</div>
        <div class="card-body">
          <span>Cookie: ${s.cookies}</span>
          <span>状态: ${valid ? '✅ 有效' : '❌ 过期'}</span>
          <span>创建: ${s.createdAt ? new Date(s.createdAt).toLocaleString() : '未知'}</span>
        </div>
        <div class="card-actions">
          <button onclick="deleteSession('${s.name}')">🗑 删除</button>
        </div>
      </div>`;
    }).join('');
  } catch { document.getElementById('sessionCards').innerHTML = '<p>加载失败</p>'; }
}

async function deleteSession(name) {
  if (!confirm(`确认删除会话 ${name}？`)) return;
  try {
    const data = await api(`/api/sessions/${name}`, { method: 'DELETE' });
    log(`🗑 ${data.msg}`);
    await loadSessionCards();
  } catch { log('❌ 删除失败'); }
}

// ── Tab 3: 结果分析 ──

async function loadResultFiles() {
  try {
    const res = await fetch('/api/profiles');
    const data = await res.json();
  } catch {}
  try {
    const res = await fetch('/');
  } catch {}
}

// ── Tab 4: 服务状态 ──

async function fetchHealth() {
  try {
    const data = await api('/health');
    const mb = (b) => (b / 1024 / 1024).toFixed(1) + ' MB';
    document.getElementById('healthDisplay').innerHTML = `
      <table style="width:100%; border-collapse:collapse;">
        <tr><td style="padding:4px 8px;font-weight:bold;">状态</td><td>✅ 运行中</td></tr>
        <tr><td style="padding:4px 8px;font-weight:bold;">版本</td><td>${data.version}</td></tr>
        <tr><td style="padding:4px 8px;font-weight:bold;">运行时间</td><td>${Math.floor(data.uptime / 60)} 分 ${Math.floor(data.uptime % 60)} 秒</td></tr>
        <tr><td style="padding:4px 8px;font-weight:bold;">平台</td><td>${data.platform}</td></tr>
        <tr><td style="padding:4px 8px;font-weight:bold;">堆内存</td><td>${mb(data.memoryUsage.heapUsed)} / ${mb(data.memoryUsage.heapTotal)}</td></tr>
        <tr><td style="padding:4px 8px;font-weight:bold;">RSS</td><td>${mb(data.memoryUsage.rss)}</td></tr>
        <tr><td style="padding:4px 8px;font-weight:bold;">已存会话</td><td>${data.profileCount}</td></tr>
        <tr><td style="padding:4px 8px;font-weight:bold;">活跃浏览器</td><td>${data.activeBrowsers}</td></tr>
      </table>`;
  } catch { document.getElementById('healthDisplay').innerHTML = '<p style="color:red;">❌ 无法获取服务状态</p>'; }
}
