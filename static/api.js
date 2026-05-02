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
  try {
    const res = await fetch(path, opts);
    return await res.json();
  } catch (e) {
    console.error("API error:", path, e.message);
    toast("网络错误: " + e.message, "error");
    return { code: -1, msg: e.message, data: [] };
  }
}

// ── 导航 ──

function switchView(view) {
  qsa(".view").forEach(v => v.classList.remove("active"));
  qsa(".nav-item").forEach(n => n.classList.remove("active"));
  el("view-" + view).classList.add("active");
  qs(`.nav-item[data-view="${view}"]`).classList.add("active");
  if (view === "dashboard") loadDashboard();
  if (view === "capture") { wizardGo(1); }
  if (view === "sessions") loadSessionCards();
  if (view === "results") loadResultFilesNew();
  if (view === "system") fetchHealth();
}

window.onload = () => {
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });
  loadDashboard();
  setInterval(fetchHealth, 5000);
};

// ── 仪表盘 ──

async function loadDashboard() {
  const [results, sessions, crawlers] = await Promise.all([
    api("/api/results").catch(() => ({ data: [] })),
    api("/api/sessions").catch(() => ({ data: [] })),
    api("/api/crawlers").catch(() => ({ data: {} })),
  ]);
  const rList = (results.data || []).slice(0, 5);
  const sList = (sessions.data || []).filter(s => s.status === "valid");
  const crawlerCount = Object.values(crawlers.data || {}).filter(v => v === "enabled").length;

  el("statCards").innerHTML = `
    <div class="stat-card"><div class="num">${crawlerCount}</div><div class="label">启用爬虫</div></div>
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
let wizardGuestMode = false;

const SITE_ICONS = {
  xiaohongshu: "🔴", zhihu: "🟠", bilibili: "🔵", tiktok: "🎵",
};
const SITE_NAMES = {
  xiaohongshu: "小红书", zhihu: "知乎", bilibili: "B站", tiktok: "TikTok",
};

async function switchCaptureTab() {
  const res = await api("/api/crawlers");
  const cfg = res.data || {};
  const cards = Object.entries(cfg).filter(([, v]) => v === "enabled").map(([id]) => ({
    id, icon: SITE_ICONS[id] || "🌐", name: SITE_NAMES[id] || id,
  }));
  if (cards.length === 0) cards.push({ id: "xiaohongshu", icon: "🔴", name: "小红书" });
  el("siteCards").innerHTML = cards.map(c =>
    `<div class="site-card ${c.id === wizardSite ? 'selected' : ''}" onclick="selectSite('${c.id}',this)">
      <div class="site-icon">${c.icon}</div>
      <div class="site-name">${c.name}</div>
    </div>`
  ).join("");
  await loadUnits();
}

async function selectSite(id, cardEl) {
  wizardSite = id;
  qsa(".site-card").forEach(c => c.classList.remove("selected"));
  cardEl.classList.add("selected");
  await loadUnits();
}

async function loadUnits() {
  const res = await api("/api/content-units?site=" + wizardSite);
  const checked = ["bili_video_info", "bili_video_comments", "tt_feed", "user_info", "zhihu_hot_search"];
  el("unitCards").innerHTML = (res.data || []).map((u, i) =>
    `<label class="card" style="cursor:pointer;display:flex;align-items:center;gap:8px;">
      <input type="checkbox" value="${u.id}" ${checked.includes(u.id) || i === 0 ? 'checked' : ''} onchange="updateWizardParams()" />
      <div><div class="card-title">${u.label}</div><div class="card-body">${u.description}</div></div>
    </label>`
  ).join("");
  el("guestModeCheck").checked = false;
  wizardGuestMode = false;
  updateWizardParams();
}

function detectSiteFromUrl(url) {
  const map = { "xiaohongshu.com": "xiaohongshu", "zhihu.com": "zhihu", "bilibili.com": "bilibili", "tiktok.com": "tiktok" };
  for (const [domain, site] of Object.entries(map)) {
    if (url.includes(domain)) return site;
  }
  return null;
}

function onPasteUrl() {
  const input = el("wizardUrl");
  const url = input?.value || "";
  const detected = detectSiteFromUrl(url);
  if (detected) {
    const card = qs(`.site-card[onclick*="${detected}"]`);
    if (card) { card.click(); toast("自动匹配站点: " + SITE_NAMES[detected], "success"); }
  }
}

async function wizardGo(step) {
  qsa(".wizard-step-content").forEach(s => s.classList.remove("active"));
  qsa(".step").forEach(s => s.classList.remove("active"));
  const target = el("wizardStep" + step);
  if (!target) { console.error("wizardStep" + step + " not found"); return; }
  target.classList.add("active");
  qsa(".step").forEach(s => { if (parseInt(s.dataset.step) <= step) s.classList.add("active"); });
  if (step === 1) { await switchCaptureTab(); }
  if (step === 2) await loadUnits();
}

async function wizardNext() {
  const current = parseInt(qs(".wizard-step-content.active")?.id?.replace("wizardStep", "") || "1");
  if (current === 1 && !wizardSite) { toast("请选择站点", "warn"); return; }
  if (current === 2) {
    const checked = qsa("#unitCards input:checked");
    if (checked.length === 0) { toast("请至少选择一项", "warn"); return; }
    wizardUnits = Array.from(checked).map(c => c.value);
    wizardGuestMode = el("guestModeCheck")?.checked || false;
  }
  await wizardGo(Math.min(current + 1, 3));
}

async function wizardPrev() {
  const current = parseInt(qs(".wizard-step-content.active")?.id?.replace("wizardStep", "") || "1");
  await wizardGo(Math.max(current - 1, 1));
}

function updateWizardParams() {
  const siteLabels = { xiaohongshu: "user_id / note_id", zhihu: "member_id / article_id", bilibili: "aid / bvid", tiktok: "unique_id / video_id" };
  const lbl = siteLabels[wizardSite] || "参数";
  el("paramFields").innerHTML = `
    <div style="margin-bottom:8px;"><label style="color:#94a3b8;">keyword（搜索词）：</label><input id="pKeyword" placeholder="关键词" /></div>
    <div style="margin-bottom:8px;"><label style="color:#94a3b8;">${lbl}：</label><input id="pNoteId" placeholder="从 URL 自动识别" /></div>
  `;
}

async function executeCapture() {
  const btn = el("captureBtn");
  btn.disabled = true; btn.textContent = "⏳ 采集中...";
  el("captureProgress").style.display = "block";
  el("captureResult").style.display = "none";
  el("progressFill").style.width = "0%";
  el("captureLog").textContent = "";

  const pKeyword = el("pKeyword")?.value || "";
  const pNoteId = el("pNoteId")?.value || "";
  const params = { keyword: pKeyword, url: el("wizardUrl")?.value || "" };
  params.user_id = pNoteId; params.member_id = pNoteId; params.mid = pNoteId;
  params.note_id = pNoteId; params.article_id = pNoteId; params.aid = pNoteId;
  params.unique_id = pNoteId; params.video_id = pNoteId;

  function log(msg) {
    el("captureLog").textContent += msg + "\n";
    el("captureLog").scrollTop = el("captureLog").scrollHeight;
  }

  log(`⏳ 采集 ${SITE_NAMES[wizardSite] || wizardSite}: ${wizardUnits.join(", ")}`);
  if (wizardGuestMode) log("🌐 游客态模式");

  try {
    const body = {
      site: wizardSite, units: wizardUnits, params,
      sessionName: "", authMode: wizardGuestMode ? "guest" : "logged_in",
    };
    const res = await api("/api/collect-units", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.code !== 0) { log("❌ " + res.msg); toast("采集失败", "error"); return; }

    el("progressFill").style.width = "100%";
    log("✅ 采集完成");

    const data = res.data || [];
    const total = data.length, success = data.filter(r => r.status === "success").length;
    el("captureResult").innerHTML = `
      <h3>📊 采集结果（${success}/${total} 成功）</h3>
      <div style="margin-bottom:8px;display:flex;gap:8px;">
        <button class="secondary" onclick="toggleFormat()" id="fmtToggle">📡 查看原始数据</button>
        <button class="secondary" onclick="downloadXlsx()" id="xlsxBtn">📊 下载 Excel</button>
      </div>
      <div id="fmtContainer">
        <pre id="fmtText" style="white-space:pre-wrap;color:#94a3b8;font-size:0.85rem;line-height:1.6;"></pre>
      </div>
      <div id="rawContainer" style="display:none;">
        ${data.map(r => {
          const icon = r.status === "success" ? "✅" : r.status === "partial" ? "⚠️" : "❌";
          const mIcon = r.method === "signature" ? "🔵" : r.method === "html_extract" ? "🟠" : "⚪";
          const preview = r.data ? JSON.stringify(r.data).slice(0, 200) : "";
          return `<details style="margin-top:8px;background:#0f172a;padding:10px;border-radius:6px;" ${r.status === "success" ? "open" : ""}>
            <summary style="cursor:pointer;">${icon} ${r.unit} ${mIcon} ${r.responseTime}ms</summary>
            <div style="font-size:0.8rem;margin-top:6px;">${r.error ? '<div style="color:#ef4444;">' + r.error + '</div>' : ''}<pre style="white-space:pre-wrap;color:#94a3b8;">${preview}</pre></div>
          </details>`;
        }).join("")}
      </div>
    `;
    lastResults = data;
    el("captureResult").style.display = "block";
    (async () => {
      const fmtRes = await api("/api/format", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ results: data }),
      });
      el("fmtText").textContent = typeof fmtRes === "string" ? fmtRes : fmtRes.data || fmtRes.msg || "（格式化失败）";
    })();
    toast(`采集完成: ${success}/${total}`, "success");
  } catch (e) {
    log("❌ " + e.message);
    toast("采集失败", "error");
  }
  btn.disabled = false; btn.textContent = "🚀 开始采集";
}

let rawVisible = false;
let lastResults = [];

async function downloadXlsx() {
  if (!lastResults || lastResults.length === 0) { toast("没有可下载的数据", "warn"); return; }
  try {
    const res = await fetch("/api/export-xlsx", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ results: lastResults }),
    });
    if (!res.ok) { toast("下载失败", "error"); return; }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "harvest-" + Date.now() + ".xlsx";
    a.click();
    URL.revokeObjectURL(a.href);
    toast("Excel 下载中", "success");
  } catch (e) { toast("下载失败: " + e.message, "error"); }
}

function toggleFormat() {
  rawVisible = !rawVisible;
  el("fmtContainer").style.display = "block";
  el("rawContainer").style.display = rawVisible ? "block" : "none";
  el("fmtToggle").textContent = rawVisible ? "📋 隐藏原始数据" : "📡 查看原始数据";
}

// ── 扫码登录（用户确认后抓取会话） ──

let qrPendingProfile = null;

async function startQrLogin() {
  const profile = prompt("会话保存名称：", "qrcode-session");
  if (!profile) return;
  const loginUrl = prompt("登录页面 URL：", "https://www.bilibili.com/login");
  if (!loginUrl) return;

  el("qrConfirmModal").style.display = "none";

  try {
    toast("⏳ 正在打开浏览器，请在手机上扫码...", "info");
    const res = await api("/api/login/qrcode", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile, loginUrl }),
    });
    if (res.code !== 0) { toast("❌ " + (res.msg || "启动失败"), "error"); return; }

    qrPendingProfile = profile;
    el("qrConfirmModal").innerHTML = `
      <h3>📱 扫码登录</h3>
      <p style="margin:12px 0;color:#94a3b8;">请用手机 App 扫描浏览器中的二维码完成登录，然后点击下方按钮</p>
      <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
        <button onclick="confirmQrCaptured()">✅ 我已登录，抓取会话</button>
        <button class="secondary" onclick="discardQrSession()">🗑 放弃</button>
      </div>
    `;
    el("qrConfirmModal").style.display = "flex";
  } catch (e) {
    toast("❌ 扫码登录失败: " + e.message, "error");
  }
}

async function confirmQrCaptured() {
  if (!qrPendingProfile) return;
  el("qrConfirmModal").innerHTML = '<p style="color:#888;">⏳ 正在抓取会话...</p>';
  try {
    const res = await api("/api/login/qrcode/confirm", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile: qrPendingProfile }),
    });
    if (res.code !== 0) { toast("❌ " + (res.msg || "抓取失败"), "error"); el("qrConfirmModal").style.display = "none"; return; }

    const info = res.data?.userInfo || {};
    el("qrConfirmModal").innerHTML = `
      <h3>✅ 已检测到登录</h3>
      <div style="margin:16px 0;font-size:1.1rem;">
        <div>站点: <strong>${info.domain || "?"}</strong></div>
        ${info.name ? '<div>用户: <strong>' + info.name + '</strong></div>' : ''}
      </div>
      <div style="display:flex;gap:12px;justify-content:center;">
        <button onclick="doQrSave()">💾 保存会话</button>
        <button class="secondary" onclick="discardQrSession()">🗑 放弃</button>
      </div>
    `;
    window.__qrSessionData = res.data.sessionData;
  } catch (e) {
    toast("❌ " + e.message, "error");
  }
}

async function doQrSave() {
  if (!qrPendingProfile || !window.__qrSessionData) return;
  const res = await api("/api/login/qrcode/confirm", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile: qrPendingProfile, sessionData: window.__qrSessionData, save: true }),
  });
  if (res.code === 0) {
    toast("✅ 会话已保存为 [" + qrPendingProfile + "]", "success");
    loadSessionCards();
  } else {
    toast("❌ " + (res.msg || "保存失败"), "error");
  }
  window.__qrSessionData = null;
  qrPendingProfile = null;
  el("qrConfirmModal").style.display = "none";
}

function discardQrSession() {
  api("/api/login/qrcode/cleanup", { method: "POST" });
  window.__qrSessionData = null;
  qrPendingProfile = null;
  el("qrConfirmModal").style.display = "none";
  toast("⏭️ 已放弃", "info");
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
  await loadSessionCards();
}

// ── 结果档案 ──

let selectedResult = "";

async function loadResultFilesNew() {
  const res = await api("/api/results");
  const list = res.data || [];
  const sel = el("resultSelect");
  if (list.length === 0) { sel.innerHTML = "<option>暂无结果</option>"; el("resultDetail").innerHTML = '<p style="color:#888;">暂无采集结果，请先执行采集任务</p>'; return; }
  sel.innerHTML = "<option value=''>-- 选择文件 --</option>" +
    list.map(f => `<option value="${f.filename}">${f.filename.split("/")[1] || f.filename}</option>`).join("");
  sel.onchange = () => loadResultDetail(sel.value);
  if (!selectedResult && list.length > 0) {
    sel.value = list[0].filename; loadResultDetail(list[0].filename);
  } else if (selectedResult) {
    sel.value = selectedResult; loadResultDetail(selectedResult);
  }
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
    const cls = d.classification || null;

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
      ${cls ? classificationHtml(cls) : ''}
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

function classificationHtml(cls) {
  const core = cls.core || {};
  const secondary = cls.secondary || {};
  const apiList = core.apiEndpoints || [];
  const tokens = core.authTokens || {};
  const antiCrawl = core.antiCrawlDefenses || [];
  return `
    <details style="margin-top:12px;background:#0f172a;padding:10px;border-radius:6px;" open>
      <summary style="cursor:pointer;font-weight:bold;">🔑 核心信息</summary>
      <div style="margin-top:8px;font-size:0.85rem;">
        <div>🔌 业务 API: ${apiList.length} 个</div>
        <div>🔐 鉴权令牌: ${Object.keys(tokens).length} 个</div>
        <div>🛡️ 反爬检测: ${antiCrawl.length} 项</div>
        ${apiList.length > 0 ? '<div style="margin-top:4px;">' + apiList.slice(0, 10).map(a =>
          `<div style="padding:2px 0;">${a.method} ${new URL(a.url).pathname}</div>`
        ).join("") + '</div>' : ''}
      </div>
    </details>
    <details style="margin-top:8px;background:#0f172a;padding:10px;border-radius:6px;">
      <summary style="cursor:pointer;font-weight:bold;">📄 次要信息</summary>
      <div style="margin-top:8px;font-size:0.85rem;">
        <div>📡 全量请求: ${secondary.allCapturedRequests?.length || 0} 条</div>
        <div>🏷️ DOM 元素: ${secondary.domStructure?.length || 0} 个</div>
        <div>👻 隐藏字段: ${secondary.hiddenFields?.length || 0} 个</div>
      </div>
    </details>
  `;
}

async function downloadResult(filename) {
  const res = await api("/api/results/" + encodeURIComponent(filename));
  const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = filename.replace(/[/\\]/g, "-"); a.click();
  URL.revokeObjectURL(a.href);
}

async function showStub(filename) {
  const res = await api("/api/results/" + encodeURIComponent(filename));
  const d = res.data || {};
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
    const [crawlersRes, featuresRes] = await Promise.all([
      api("/api/crawlers").catch(() => ({ data: {} })),
      api("/api/features").catch(() => ({ data: {} })),
    ]);

    const crawlerConfig = crawlersRes.data || {};
    const crawlerNames = { xiaohongshu: "🔴 小红书", zhihu: "🟠 知乎", bilibili: "🔵 B站", tiktok: "🎵 TikTok" };
    const crawlerHtml = Object.entries(crawlerConfig)
      .filter(([, v]) => v === "enabled")
      .map(([id]) => `<div>${crawlerNames[id] || id}</div>`).join("");

    const flags = featuresRes.data || {};
    const flagsHtml = Object.entries(flags).map(([k, v]) => {
      const icon = v.enabled ? "✅" : "⬜";
      const note = v.implemented ? "" : " (未实现)";
      return `<div>${icon} ${k}${note}</div>`;
    }).join("");

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
        <div class="card-title">🤖 已启用爬虫</div>
        <div class="card-body">${crawlerHtml || '<span style="color:#888;">无</span>'}</div>
      </div>
      <div class="card" style="margin-top:12px;">
        <div class="card-title">⚙️ 功能开关</div>
        <div class="card-body">${flagsHtml}</div>
      </div>
    `;
  } catch { el("healthDisplay").innerHTML = '<p style="color:red;">❌ 无法获取系统状态</p>'; }
}
