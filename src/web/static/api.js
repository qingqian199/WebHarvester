(function () {
  const TOKEN_KEY = "wh_token";
  let eventSource = null;

  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
  function clearToken() { localStorage.removeItem(TOKEN_KEY); }

  async function api(path, opts = {}) {
    const headers = { "Content-Type": "application/json" };
    const token = getToken();
    if (token) headers["Authorization"] = "Bearer " + token;
    const res = await fetch(path, { ...opts, headers });
    if (res.status === 401) {
      clearToken();
      render();
      return null;
    }
    return res.json();
  }

  async function login(username, password) {
    const json = await api("/api/auth/login", {
      method: "POST", body: JSON.stringify({ username, password }),
    });
    if (json && json.code === 0 && json.data.token) {
      setToken(json.data.token);
      render();
      return true;
    }
    return false;
  }

  function connectTaskStream() {
    if (eventSource) { eventSource.close(); }
    const token = getToken();
    if (!token) return;
    eventSource = new EventSource("/api/tasks/stream?token=" + encodeURIComponent(token));
    eventSource.addEventListener("queue", function (e) {
      try {
        const data = JSON.parse(e.data);
        updateQueueDisplay(data);
      } catch (err) { console.warn("SSE queue parse error", err); }
    });
    eventSource.addEventListener("task", function (e) {
      try {
        const data = JSON.parse(e.data);
        addTaskCard(data);
      } catch (err) { console.warn("SSE task parse error", err); }
    });
    eventSource.onerror = function () {
      // 自动重连由 EventSource 原生处理
    };
  }

  function render() {
    const app = document.getElementById("app");
    const token = getToken();
    if (!token) {
      renderLogin(app);
    } else {
      api("/api/health").then((j) => {
        if (!j || j.code === -1) { clearToken(); render(); return; }
        renderDashboard(app);
        connectTaskStream();
      }).catch(() => { clearToken(); render(); });
    }
  }

  function renderLogin(app) {
    app.innerHTML = `
      <div class="login-container">
        <div class="login-box">
          <h1>WebHarvester</h1>
          <p style="text-align:center;color:#94a3b8;margin-bottom:1.5rem;">请登录以继续</p>
          <div class="form-group">
            <label>用户名</label>
            <input type="text" id="login-user" placeholder="admin" />
          </div>
          <div class="form-group">
            <label>密码</label>
            <input type="password" id="login-pass" placeholder="admin" />
          </div>
          <button class="primary" id="login-btn" style="width:100%">登录</button>
          <div class="login-error" id="login-error"></div>
        </div>
      </div>
    `;
    document.getElementById("login-btn").onclick = async () => {
      const u = document.getElementById("login-user").value;
      const p = document.getElementById("login-pass").value;
      const ok = await login(u, p);
      if (!ok) {
        document.getElementById("login-error").textContent = "用户名或密码错误";
      }
    };
    document.getElementById("login-pass").onkeydown = (e) => {
      if (e.key === "Enter") document.getElementById("login-btn").click();
    };
    document.getElementById("login-user").focus();
  }

  function renderDashboard(app) {
    app.innerHTML = `
      <div class="navbar">
        <h1>WebHarvester</h1>
        <div class="user-info">
          <span>面板管理</span>
          <button id="logout-btn" class="danger">退出登录</button>
        </div>
      </div>
      <div class="tabs" id="tabs">
        <button class="tab active" data-tab="health">系统状态</button>
        <button class="tab" data-tab="tasks">任务中心</button>
        <button class="tab" data-tab="sessions">会话管理</button>
        <button class="tab" data-tab="results">采集结果</button>
        <button class="tab" data-tab="features">功能开关</button>
      </div>
      <div id="tab-content">
        <div class="tab-content active" id="tab-health"></div>
        <div class="tab-content" id="tab-tasks">
          <div id="task-queue-status" class="health-grid mt-1 mb-2"></div>
          <h2>任务进度</h2>
          <div id="task-cards"></div>
        </div>
        <div class="tab-content" id="tab-sessions"></div>
        <div class="tab-content" id="tab-results"></div>
        <div class="tab-content" id="tab-features"></div>
      </div>
    `;

    document.querySelectorAll(".tab").forEach((tab) => {
      tab.onclick = () => {
        document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
        document.querySelectorAll(".tab-content").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        document.getElementById("tab-" + tab.dataset.tab).classList.add("active");
      };
    });

    document.getElementById("logout-btn").onclick = () => { clearToken(); render(); };

    loadHealth();
    loadSessions();
    loadResults();
    loadFeatures();
  }

  function updateQueueDisplay(status) {
    const el = document.getElementById("task-queue-status");
    if (!el) return;
    el.innerHTML = `
      <div class="health-item"><div class="value">${status.pending}</div><div class="label">等待中</div></div>
      <div class="health-item"><div class="value">${status.running}</div><div class="label">运行中</div></div>
      <div class="health-item"><div class="value">${status.completed}</div><div class="label">已完成</div></div>
      <div class="health-item"><div class="value">${status.failed}</div><div class="label">失败</div></div>
    `;
  }

  function addTaskCard(data) {
    const el = document.getElementById("task-cards");
    if (!el) return;
    const isStarted = data.units !== undefined && data.site !== undefined;
    const isCompleted = data.result !== undefined;
    const isFailed = data.error !== undefined;
    let html = "";
    if (isStarted) {
      html = '<div class="card task-card" id="task-' + data.taskId + '">' +
        '<div class="flex"><span class="badge badge-warn">运行中</span>' +
        '<strong>' + (data.site || "?") + '</strong>' +
        '<span style="color:#64748b;font-size:0.85rem">' + data.taskId + '</span></div>' +
        '<div class="mt-1" style="font-size:0.85rem;color:#94a3b8">单元: ' + (data.units || []).join(", ") + '</div>' +
        '</div>';
    } else if (isCompleted) {
      html = '<div class="card task-card" id="task-' + data.taskId + '">' +
        '<div class="flex"><span class="badge badge-ok">完成</span>' +
        '<strong>' + data.taskId + '</strong></div></div>';
    } else if (isFailed) {
      html = '<div class="card task-card" id="task-' + data.taskId + '">' +
        '<div class="flex"><span class="badge badge-err">失败</span>' +
        '<strong>' + data.taskId + '</strong></div>' +
        '<div class="mt-1" style="font-size:0.85rem;color:#fca5a5">' + data.error + '</div></div>';
    }
    if (html) {
      el.insertAdjacentHTML("afterbegin", html);
    }
  }

  async function loadHealth() {
    const el = document.getElementById("tab-health");
    el.innerHTML = '<div style="text-align:center;padding:2rem"><div class="spinner"></div></div>';
    const j = await api("/api/health");
    if (!j) return;
    const d = j.data || j;
    el.innerHTML = `
      <div class="health-grid">
        <div class="health-item"><div class="value">${d.status || "ok"}</div><div class="label">状态</div></div>
        <div class="health-item"><div class="value">${(d.uptime || 0).toFixed(0)}s</div><div class="label">运行时间</div></div>
        <div class="health-item"><div class="value">${d.version || "-"}</div><div class="label">版本</div></div>
        <div class="health-item"><div class="value">${d.platform || "-"}</div><div class="label">平台</div></div>
        <div class="health-item"><div class="value">${d.profileCount || 0}</div><div class="label">会话数</div></div>
        <div class="health-item"><div class="value">${d.taskQueueLength || 0}</div><div class="label">队列长度</div></div>
      </div>
    `;
  }

  async function loadSessions() {
    const el = document.getElementById("tab-sessions");
    el.innerHTML = '<div style="text-align:center;padding:2rem"><div class="spinner"></div></div>';
    const j = await api("/api/sessions");
    if (!j) return;
    const sessions = j.data || [];
    if (!sessions.length) { el.innerHTML = '<p style="color:#64748b">暂无会话</p>'; return; }
    el.innerHTML = `
      <table>
        <thead><tr><th>名称</th><th>状态</th><th>Cookie 数</th><th>创建时间</th><th>操作</th></tr></thead>
        <tbody>
          ${sessions.map((s) => `
            <tr>
              <td>${s.name}</td>
              <td><span class="badge ${s.status === "valid" ? "badge-ok" : "badge-err"}">${s.status}</span></td>
              <td>${s.cookies}</td>
              <td>${s.createdAt ? new Date(s.createdAt).toLocaleString() : "-"}</td>
              <td><button class="danger" onclick="deleteSession('${s.name}')">删除</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  window.deleteSession = async function (name) {
    if (!confirm("确定删除会话 " + name + "？")) return;
    await api("/api/sessions/" + encodeURIComponent(name), { method: "DELETE" });
    loadSessions();
  };

  async function loadResults() {
    const el = document.getElementById("tab-results");
    el.innerHTML = '<div style="text-align:center;padding:2rem"><div class="spinner"></div></div>';
    const j = await api("/api/results");
    if (!j) return;
    const items = j.data || [];
    if (!items.length) { el.innerHTML = '<p style="color:#64748b">暂无采集结果</p>'; return; }
    el.innerHTML = `
      <table>
        <thead><tr><th>文件名</th><th>URL</th><th>采集时间</th><th>大小</th></tr></thead>
        <tbody>
          ${items.slice(0, 50).map((r) => `
            <tr>
              <td>${r.filename}</td>
              <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.url || "-"}</td>
              <td>${new Date(r.timestamp).toLocaleString()}</td>
              <td>${(r.size / 1024).toFixed(1)} KB</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  async function loadFeatures() {
    const el = document.getElementById("tab-features");
    el.innerHTML = '<div style="text-align:center;padding:2rem"><div class="spinner"></div></div>';
    const j = await api("/api/features");
    if (!j) return;
    const flags = j.data || {};
    const entries = Object.entries(flags);
    if (!entries.length) { el.innerHTML = '<p style="color:#64748b">暂无功能开关</p>'; return; }
    el.innerHTML = `
      <table>
        <thead><tr><th>开关名</th><th>状态</th><th>实现状态</th></tr></thead>
        <tbody>
          ${entries.map(([k, v]) => `
            <tr>
              <td><code>${k}</code></td>
              <td><span class="badge ${v.enabled ? "badge-ok" : "badge-err"}">${v.enabled ? "开" : "关"}</span></td>
              <td><span class="badge ${v.implemented ? "badge-ok" : "badge-warn"}">${v.implemented ? "已实现" : "未实现"}</span></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  // 页面加载后立即渲染
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render);
  } else {
    render();
  }
})();
