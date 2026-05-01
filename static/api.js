function log(text) {
  const box = document.getElementById("logBox");
  box.innerHTML += `[${new Date().toLocaleTimeString()}] ${text}\n`;
  box.scrollTop = box.scrollHeight;
}

function switchTab(tabId, el) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  document.getElementById(tabId).classList.add('active');
}

window.onload = async () => {
    await refreshProfileSelect();
    await fetchHealth();
    await loadSessionCards();
    await loadResultFiles();
    await onSiteChange();
    setInterval(fetchHealth, 10000);
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

async function onSiteChange() {
  const site = document.getElementById('collectSite').value;
  const units = await api('/api/content-units?site=' + site);
  const container = document.getElementById('unitCheckboxes');
  if (!units.data || units.data.length === 0) {
    container.innerHTML = '<p style="color:#888;">该站点无可用内容单元</p>'; return;
  }
  container.innerHTML = units.data.map((u, i) =>
    `<label class="card" style="cursor:pointer;display:flex;gap:8px;align-items:center;">
      <input type="checkbox" value="${u.id}" checked="${i < 2}" onchange="onUnitChange()" />
      <div><div style="font-weight:600;">${u.label}</div><div style="font-size:0.8rem;color:#94a3b8;">${u.description}</div></div>
    </label>`
  ).join('');
  onUnitChange();
}

function onUnitChange() {
  const checked = document.querySelectorAll('#unitCheckboxes input:checked');
  const needed = new Set();
  checked.forEach(cb => {
    const card = cb.closest('.card');
    // 简化：从所有单元中查找
  });
  // 动态显示参数输入
  const paramDiv = document.getElementById('paramInputs');
  paramDiv.innerHTML = `
    <div class="form-row"><input id="paramKeyword" placeholder="keyword（搜索词）" style="flex:1;" /></div>
    <div class="form-row"><input id="paramUserId" placeholder="user_id / member_id / mid" style="flex:1;" /></div>
    <div class="form-row"><input id="paramNoteId" placeholder="note_id / article_id / aid / bvid" style="flex:1;" /></div>
  `;
}

async function startUnitCollect() {
  const site = document.getElementById('collectSite').value;
  const profile = document.getElementById('profileSelect').value;
  const authMode = document.getElementById('authModeSelect').value;

  const checked = document.querySelectorAll('#unitCheckboxes input:checked');
  const units = Array.from(checked).map(cb => cb.value);
  if (units.length === 0) return alert('请至少勾选一个内容单元');

  const params = {
    keyword: document.getElementById('paramKeyword')?.value || '',
    user_id: document.getElementById('paramUserId')?.value || '',
    member_id: document.getElementById('paramUserId')?.value || '',
    mid: document.getElementById('paramUserId')?.value || '',
    note_id: document.getElementById('paramNoteId')?.value || '',
    article_id: document.getElementById('paramNoteId')?.value || '',
    aid: document.getElementById('paramNoteId')?.value || '',
  };

  const resultDiv = document.getElementById('collectResult');
  resultDiv.innerHTML = '<p style="color:#888;">⏳ 采集中...</p>';
  log(`📦 组合采集 ${site}: ${units.join(', ')}`);

  try {
    const res = await api('/api/collect-units', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site, units, params, sessionName: profile, authMode }),
    });
    if (res.code !== 0) { resultDiv.innerHTML = `<p style="color:red;">❌ ${res.msg}</p>`; return; }

    resultDiv.innerHTML = (res.data || []).map(r => {
      const icon = r.status === 'success' ? '✅' : r.status === 'partial' ? '⚠️' : '❌';
      const methodIcon = r.method === 'signature' ? '🔵' : r.method === 'html_extract' ? '🟠' : '⚪';
      const preview = r.data ? JSON.stringify(r.data).slice(0, 200) : '';
      return `<details style="margin-top:8px;background:#0f172a;padding:10px;border-radius:6px;" ${r.status === 'success' ? 'open' : ''}>
        <summary style="cursor:pointer;">${icon} ${r.unit} ${methodIcon} ${r.responseTime}ms</summary>
        <div style="font-size:0.8rem;margin-top:6px;">${r.error ? '<div style="color:#ef4444;">' + r.error + '</div>' : ''}<pre style="white-space:pre-wrap;color:#94a3b8;">${preview}</pre></div>
      </details>`;
    }).join('');
    log('✅ 组合采集完成');
  } catch (e) {
    resultDiv.innerHTML = `<p style="color:red;">❌ ${e.message}</p>`;
  }
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
    const res = await api('/api/results');
    const list = res.data || [];
    const select = document.getElementById('resultSelect');
    const container = document.getElementById('resultDetail');
    if (list.length === 0) {
      select.innerHTML = '<option>-- 暂无采集结果 --</option>';
      container.innerHTML = '<p style="color:#888;">暂无采集结果，请先执行采集任务</p>';
      return;
    }
    select.innerHTML = '<option value="">-- 选择结果文件 --</option>' +
      list.map(f => `<option value="${f.filename}">${f.filename.split('/')[0]} / ${f.filename.split('/')[1]} (${(f.size/1024).toFixed(1)}KB)</option>`).join('');
    select.onchange = () => loadResultDetail(select.value);
    // 清理之前可能残留的 onchange
  } catch { document.getElementById('resultDetail').innerHTML = '<p style="color:red;">❌ 加载列表失败</p>'; }
}

async function loadResultDetail(filename) {
  if (!filename) { document.getElementById('resultDetail').innerHTML = ''; return; }
  const container = document.getElementById('resultDetail');
  container.innerHTML = '<p style="color:#888;">⏳ 加载中...</p>';
  try {
    const res = await api('/api/results/' + encodeURIComponent(filename));
    const result = res.data;
    const url = result.targetUrl || result.url || '未知';
    const traceId = result.traceId || '—';
    const createdAt = result.capturedAt || result.finishedAt ? new Date(result.finishedAt || result.capturedAt).toLocaleString() : '—';
    const statusCode = result.statusCode || '—';

    const hasClassification = result.classification;
    const core = result.classification?.core || {};
    const secondary = result.classification?.secondary || {};
    const apiEndpoints = core.apiEndpoints || result.analysis?.apiRequests || [];
    const authTokens = core.authTokens || {};
    const antiCrawl = core.antiCrawlDefenses || [];
    const allReqs = secondary.allCapturedRequests || result.networkRequests || [];
    const hiddenFields = secondary.hiddenFields || [];

    let html = `<div class="card" style="margin-bottom:12px;">
      <div class="card-title">${url}</div>
      <div class="card-body">
        <span>Trace: ${traceId}</span>
        <span>采集时间: ${createdAt}</span>
        <span>请求数: ${allReqs.length}</span>
        <span>API端点: ${apiEndpoints.length}</span>
        ${statusCode !== '—' ? `<span>状态码: ${statusCode}</span>` : ''}
      </div>
    </div>`;

    // 核心信息
    if (hasClassification) html += '<details open><summary style="cursor:pointer;font-weight:bold;margin:8px 0;">🔑 核心信息</summary>';
    if (apiEndpoints.length > 0) {
      html += '<table style="width:100%;border-collapse:collapse;font-size:0.8rem;">';
      html += '<tr style="background:#334155;"><th style="padding:4px;">方法</th><th style="padding:4px;">URL</th><th style="padding:4px;">状态</th></tr>';
      apiEndpoints.slice(0, 30).forEach(r => {
        html += `<tr style="border-bottom:1px solid #334155;"><td style="padding:4px;">${r.method}</td><td style="padding:4px;max-width:400px;overflow:hidden;text-overflow:ellipsis;">${r.url}</td><td style="padding:4px;">${r.statusCode}</td></tr>`;
      });
      if (apiEndpoints.length > 30) html += '<tr><td colspan="3" style="padding:4px;color:#888;">仅展示前 30 条</td></tr>';
      html += '</table>';
    }
    if (Object.keys(authTokens).length > 0) {
      html += '<h4 style="margin:8px 0 4px;">鉴权令牌</h4>';
      Object.entries(authTokens).forEach(([k, v]) => {
        const masked = typeof v === 'string' && v.length > 12 ? v.slice(0,6) + '****' + v.slice(-4) : v;
        html += `<div style="font-size:0.8rem;padding:2px 0;"><code>${k}</code>: ${masked}</div>`;
      });
    }
    if (antiCrawl.length > 0) {
      html += '<h4 style="margin:8px 0 4px;">反爬检测</h4>';
      antiCrawl.forEach(a => { html += `<div style="font-size:0.8rem;padding:2px 0;">${a.severity === 'high' ? '🔴' : '🟡'} ${a.category}</div>`; });
    }
    if (hasClassification) html += '</details>';

    // 次要信息
    if (hasClassification) {
      html += '<details style="margin-top:8px;"><summary style="cursor:pointer;font-weight:bold;">📄 次要信息</summary>';
      html += `<div style="font-size:0.8rem;padding:4px 0;">全量请求: ${allReqs.length} | 隐藏字段: ${hiddenFields.length}</div>`;
      if (hiddenFields.length > 0) {
        hiddenFields.forEach(f => { html += `<div style="font-size:0.8rem;">${f.name}: ${f.value || ''}</div>`; });
      }
      html += '</details>';
    }

    // 下载按钮
    html += '<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">';
    html += `<button onclick="downloadFile('${filename}','json')">📥 JSON</button>`;
    html += '</div>';

    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = `<p style="color:red;">❌ 加载失败: ${e.message}</p>`;
  }
}

async function downloadFile(filename, format) {
  const res = await api('/api/results/' + encodeURIComponent(filename));
  const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename.replace('/', '-');
  a.click();
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
