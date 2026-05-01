// ── 通用工具 ──

function toast(msg, type = "info") {
  const c = document.getElementById("toastContainer");
  const t = document.createElement("div");
  t.className = "toast " + type;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function el(id) { return document.getElementById(id); }
function qs(s, p) { return (p || document).querySelector(s); }
function qsa(s, p) { return (p || document).querySelectorAll(s); }

async function api(path, opts) {
  const res = await fetch(path, opts);
  return res.json();
}

// ── 导航 ──

function switchView(view) {
  qsa(".view").forEach(v => v.classList.remove("active"));
  qsa(".nav-item").forEach(n => n.classList.remove("active"));
  el("view-" + view).classList.add("active");
  qs(`.nav-item[data-view="${view}"]`).classList.add("active");
  if (view === "dashboard") loadDashboard();
  if (view === "capture") { wizardGo(1); switchCaptureTab(); }
  if (view === "sessions") loadSessionCards();
  if (view === "results") loadResultFilesNew();
  if (view === "system") fetchHealth();
}

window.onload = () => {
  // 绑定导航点击
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });
  loadDashboard();
  setInterval(fetchHealth, 5000);
};

// ── 仪表盘 ──

async function loadDashboard() {
  const [results, sessions] = await Promise.all([
    api("/api/results").catch(() => ({ data: [] })),
    api("/api/sessions").catch(() => ({ data: [] })),
  ]);
  const rList = (results.data || []).slice(0, 5);
  const sList = (sessions.data || []).filter(s => s.status === "valid");

  el("statCards").innerHTML = `
    <div class="stat-card"><div class="num">3</div><div class="label">特化爬虫</div></div>
    <div class="stat-card"><div class="num">${(results.data || []).length}</div><div class="label">采集结果</div></div>
    <div class="stat-card"><div class="num">${sList.length}</div><div class="label">有效会话</div></div>
  `;

  if (rList.length === 0) {
    el("recentResults").innerHTML = '<p style="color:#888;">暂无采集结果</p>';
  } else {
    el("recentResults").innerHTML = '<table><tr><th>文件</th><th>时间</th><th>大小</th></tr>' +
      rList.map(f => `<tr><td>${f.filename}</td><td>${new Date(f.timestamp).toLocaleString()}</td><td>${(f.size/1024).toFixed(1)}KB</td></tr>`).join("") +
      "</table>";
  }
}

// ── 采集中心 ──

let wizardSite = "xiaohongshu";
let wizardUnits = [];

function switchCaptureTab() {
  const cards = [
    { id: "xiaohongshu", icon: "🔴", name: "小红书", status: "5 verified" },
    { id: "zhihu", icon: "🟠", name: "知乎", status: "11 verified" },
    { id: "bilibili", icon: "🔵", name: "B站", status: "4 verified" },
  ];
  el("siteCards").innerHTML = cards.map(c =>
    `<div class="site-card ${c.id === wizardSite ? 'selected' : ''}" onclick="selectSite('${c.id}',this)">
      <div class="site-icon">${c.icon}</div>
      <div class="site-name">${c.name}</div>
      <div style="font-size:0.8rem;color:#94a3b8;">${c.status}</div>
    </div>`
  ).join("");
  loadUnits();
}

function selectSite(id, el) {
  wizardSite = id;
  qsa(".site-card").forEach(c => c.classList.remove("selected"));
  el.classList.add("selected");
  loadUnits();
}

async function loadUnits() {
  const res = await api("/api/content-units?site=" + wizardSite);
  el("unitCards").innerHTML = (res.data || []).map((u, i) =>
    `<label class="card" style="cursor:pointer;display:flex;align-items:center;gap:8px;">
      <input type="checkbox" value="${u.id}" ${i < 2 ? 'checked' : ''} onchange="updateWizardParams()" />
      <div><div class="card-title">${u.label}</div><div class="card-body">${u.description}</div></div>
    </label>`
  ).join("");
  updateWizardParams();
}

function wizardGo(step) {
  qsa(".wizard-step-content").forEach(s => s.classList.remove("active"));
  qsa(".step").forEach(s => s.classList.remove("active"));
  el("wizardStep" + step).classList.add("active");
  qsa(".step").forEach(s => { if (parseInt(s.dataset.step) <= step) s.classList.add("active"); });
  if (step === 1) switchCaptureTab();
  if (step === 2) loadUnits();
}

function wizardNext() {
  const current = parseInt(qs(".wizard-step-content.active")?.id?.replace("wizardStep", "") || "1");
  if (current === 1 && !wizardSite) { toast("请选择站点", "warn"); return; }
  if (current === 2) {
    const checked = qsa("#unitCards input:checked");
    if (checked.length === 0) { toast("请至少选择一项", "warn"); return; }
    wizardUnits = Array.from(checked).map(c => c.value);
  }
  wizardGo(Math.min(current + 1, 3));
}

function wizardPrev() {
  const current = parseInt(qs(".wizard-step-content.active")?.id?.replace("wizardStep", "") || "1");
  wizardGo(Math.max(current - 1, 1));
}

function updateWizardParams() {
  el("paramFields").innerHTML = `
    <div style="margin-bottom:8px;"><label style="color:#94a3b8;">keyword（搜索词）：</label><input id="pKeyword" placeholder="原神" /></div>
    <div style="margin-bottom:8px;"><label style="color:#94a3b8;">user_id / member_id / mid：</label><input id="pUserId" placeholder="用户ID" /></div>
    <div style="margin-bottom:8px;"><label style="color:#94a3b8;">note_id / article_id / aid：</label><input id="pNoteId" placeholder="内容ID" /></div>
  `;
}

async function executeCapture() {
  const btn = el("captureBtn");
  btn.disabled = true; btn.textContent = "⏳ 采集中...";
  el("captureProgress").style.display = "block";
  el("captureResult").style.display = "none";
  el("progressFill").style.width = "0%";
  el("captureLog").textContent = "";

  const params = {
    keyword: el("pKeyword")?.value || "", user_id: el("pUserId")?.value || "",
    member_id: el("pUserId")?.value || "", mid: el("pUserId")?.value || "",
    note_id: el("pNoteId")?.value || "", article_id: el("pNoteId")?.value || "",
    aid: el("pNoteId")?.value || "",
  };

  function log(msg) {
    el("captureLog").textContent += msg + "\n";
    el("captureLog").scrollTop = el("captureLog").scrollHeight;
  }

  log(`⏳ 采集 ${wizardSite}: ${wizardUnits.join(", ")}`);

  try {
    const res = await api("/api/collect-units", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site: wizardSite, units: wizardUnits, params, sessionName: "" }),
    });
    if (res.code !== 0) { log("❌ " + res.msg); toast("采集失败", "error"); return; }

    el("progressFill").style.width = "100%";
    log("✅ 采集完成");

    const data = res.data || [];
    const total = data.length, success = data.filter(r => r.status === "success").length;
    el("captureResult").innerHTML = `
      <h3>📊 采集结果（${success}/${total} 成功）</h3>
      ${data.map(r => {
        const icon = r.status === "success" ? "✅" : r.status === "partial" ? "⚠️" : "❌";
        const mIcon = r.method === "signature" ? "🔵" : r.method === "html_extract" ? "🟠" : "⚪";
        const preview = r.data ? JSON.stringify(r.data).slice(0, 200) : "";
        return `<details style="margin-top:8px;background:#0f172a;padding:10px;border-radius:6px;" ${r.status === "success" ? "open" : ""}>
          <summary style="cursor:pointer;">${icon} ${r.unit} ${mIcon} ${r.responseTime}ms</summary>
          <div style="font-size:0.8rem;margin-top:6px;">${r.error ? '<div style="color:#ef4444;">' + r.error + '</div>' : ''}<pre style="white-space:pre-wrap;color:#94a3b8;">${preview}</pre></div>
        </details>`;
      }).join("")}
    `;
    el("captureResult").style.display = "block";
    toast(`采集完成: ${success}/${total}`, "success");
  } catch (e) {
    log("❌ " + e.message);
    toast("采集失败", "error");
  }
  btn.disabled = false; btn.textContent = "🚀 开始采集";
}

// ── 会话管理 ──

async function loadSessionCards() {
  const res = await api("/api/sessions");
  const list = res.data || [];
  const c = el("sessionCards");
  if (list.length === 0) { c.innerHTML = '<p style="color:#888;">暂无已存会话</p>'; return; }
  c.innerHTML = list.map(s => {
    const v = s.status === "valid";
    return `<div class="card" style="border-left:4px solid ${v ? '#22c55e' : '#ef4444'};">
      <div class="card-title">${s.name}</div>
      <div class="card-body">
        <span>🍪 ${s.cookies} cookies</span>
        <span>${v ? '✅ 有效' : '❌ 过期'}</span>
        <span>📅 ${s.createdAt ? new Date(s.createdAt).toLocaleString() : '未知'}</span>
      </div>
      <div style="margin-top:8px;">
        <button class="secondary" onclick="deleteSession('${s.name}')">🗑 删除</button>
      </div>
    </div>`;
  }).join("");
}

async function deleteSession(name) {
  if (!confirm("删除会话 " + name + "？")) return;
  await api("/api/sessions/" + name, { method: "DELETE" });
  toast("已删除 " + name, "success");
  loadSessionCards();
}

// ── 结果档案 ──

let selectedResult = "";

async function loadResultFilesNew() {
  const res = await api("/api/results");
  const list = res.data || [];
  const sel = el("resultSelect");
  if (list.length === 0) { sel.innerHTML = "<option>暂无结果</option>"; return; }
  sel.innerHTML = "<option value=''>-- 选择文件 --</option>" +
    list.map(f => `<option value="${f.filename}">${f.filename.split("/")[1] || f.filename}</option>`).join("");
  sel.onchange = () => loadResultDetail(sel.value);
  if (selectedResult) { sel.value = selectedResult; loadResultDetail(selectedResult); }
}

async function loadResultDetail(filename) {
  if (!filename) { el("resultDetail").innerHTML = '<p style="color:#888;">选择文件后查看详情</p>'; return; }
  selectedResult = filename;
  el("resultDetail").innerHTML = '<p style="color:#888;">⏳ 加载中...</p>';
  try {
    const res = await api("/api/results/" + encodeURIComponent(filename));
    const d = res.data || {};
    const url = d.targetUrl || d.url || "未知";
    const time = d.finishedAt || d.capturedAt || "";
    const reqs = d.networkRequests || [];
    const apis = d.analysis?.apiRequests || [];

    el("resultDetail").innerHTML = `
      <div class="card" style="margin-bottom:12px;">
        <div class="card-title" style="word-break:break-all;">${url}</div>
        <div class="card-body">
          <div>⏱ ${d.responseTime || (d.finishedAt - d.startedAt) || "?"}ms</div>
          <div>📡 ${reqs.length} 请求 | 🔌 ${apis.length} API</div>
          ${time ? '<div>📅 ' + new Date(time).toLocaleString() + '</div>' : ''}
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button onclick="downloadResult('${filename}','json')">📥 JSON</button>
        <button class="secondary" onclick="showStub('${filename}')">📜 生成桩代码</button>
      </div>
      ${apis.length > 0 ? '<h4 style="margin-top:12px;">🔌 API 端点</h4><table><tr><th>方法</th><th>路径</th><th>状态</th></tr>' +
        apis.slice(0, 20).map(a => {
          try { const u = new URL(a.url); return `<tr><td>${a.method}</td><td>${u.pathname}</td><td>${a.statusCode}</td></tr>`; }
          catch { return ""; }
        }).join("") + '</table>' : ''}
      ${d.storage?.cookies?.length ? '<h4 style="margin-top:12px;">🍪 Cookie 摘要</h4>' +
        d.storage.cookies.filter(c => ["session", "token", "sid"].some(k => c.name.toLowerCase().includes(k)))
          .map(c => `<div style="font-size:0.8rem;">${c.name}: ${(c.value + "").slice(0,30)}...</div>`).join("") : ''}
    `;
  } catch { el("resultDetail").innerHTML = '<p style="color:red;">❌ 加载失败</p>'; }
}

async function downloadResult(filename, fmt) {
  const res = await api("/api/results/" + encodeURIComponent(filename));
  const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = filename.replace(/[/\\]/g, "-"); a.click();
  URL.revokeObjectURL(a.href);
}

async function showStub(filename) {
  const res = await api("/api/results/" + encodeURIComponent(filename));
  const d = res.data || {};
  // 检测是否有 WBI 签名数据
  const ls = d.storage?.localStorage || {};
  const hasWbi = ls.wbi_img_url || ls.wbi_sub_url;
  const code = hasWbi
    ? `# 从 localStorage 提取 WBI 密钥\nIMG_KEY = "${(ls.wbi_img_url || "").slice(0,40)}"\nSUB_KEY = "${(ls.wbi_sub_url || "").slice(0,40)}"\n# 使用 npm run gen-stub 生成完整桩代码`
    : "# 未检测到签名数据\n# 请选择支持签名的采集结果文件";
  el("stubCode").textContent = code;
  el("stubModal").style.display = "flex";
}

function closeModal() { el("stubModal").style.display = "none"; }

function copyStub() {
  navigator.clipboard.writeText(el("stubCode").textContent);
  toast("已复制", "success");
}

// ── 系统状态 ──

async function fetchHealth() {
  try {
    const d = await api("/health");
    const mb = b => (b / 1024 / 1024).toFixed(1) + " MB";
    el("healthDisplay").innerHTML = `
      <div class="stat-cards">
        <div class="stat-card"><div class="num">${Math.floor(d.uptime / 60)}</div><div class="label">运行分钟</div></div>
        <div class="stat-card"><div class="num">${mb(d.memoryUsage?.rss || 0)}</div><div class="label">RSS 内存</div></div>
        <div class="stat-card"><div class="num">${d.profileCount || 0}</div><div class="label">已存会话</div></div>
      </div>
      <div class="card" style="margin-top:12px;">
        <div class="card-title">⚙️ 详细</div>
        <div class="card-body">
          <div>版本: ${d.version}</div>
          <div>平台: ${d.platform}</div>
          <div>堆内存: ${mb(d.memoryUsage?.heapUsed || 0)} / ${mb(d.memoryUsage?.heapTotal || 0)}</div>
          <div>活跃浏览器: ${d.activeBrowsers || 0}</div>
        </div>
      </div>
      <div class="card" style="margin-top:12px;">
        <div class="card-title">🤖 已注册爬虫</div>
        <div class="card-body">
          <div>🔴 小红书（xiaohongshu.com）— 5 verified</div>
          <div>🟠 知乎（zhihu.com）— 11 verified</div>
          <div>🔵 B站（bilibili.com）— 4 verified</div>
        </div>
      </div>
    `;
  } catch { el("healthDisplay").innerHTML = '<p style="color:red;">❌ 无法获取系统状态</p>'; }
}
