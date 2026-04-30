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
    await fetchHealth();
    setInterval(fetchHealth, 10000);
};

async function refreshProfileSelect() {
    try {
        const res = await fetch('/api/profiles');
        const data = await res.json();
        const select = document.getElementById('profileSelect');
        select.innerHTML = '<option value="">不使用登录状态</option>';
        data.data.forEach(p => {
            select.innerHTML += `<option value="${p}">${p}</option>`;
        });
    } catch { }
}

async function runSingle() {
    const url = document.getElementById('urlInput').value.trim();
    if (!url) return alert('请输入网址');
    const profile = document.getElementById('profileSelect').value;

    log('开始采集：' + url + (profile ? ' (使用会话 ' + profile + ')' : ''));
    try {
        const res = await fetch('/api/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, profile })
        });
        const data = await res.json();
        if (data.code === 0) {
            log('✅ 采集完成，报告已输出至 output 目录');
        } else {
            log('❌ 失败：' + data.msg);
        }
    } catch (e) {
        log('❌ 接口请求异常');
    }
}

async function runBatch() {
    log('开始执行批量任务...');
    try {
        const res = await fetch('/api/batch');
        const data = await res.json();
        if (data.code === 0) {
            log('✅ 批量任务全部执行完成');
        } else {
            log('❌ 失败：' + data.msg);
        }
    } catch (e) {
        log('❌ 接口请求异常');
    }
}

async function startLogin() {
    const profile = document.getElementById('profileNameLogin').value.trim();
    const loginUrl = document.getElementById('loginUrlInput').value.trim();
    const verifyUrl = document.getElementById('verifyUrlInput').value.trim();

    if (!profile || !loginUrl || !verifyUrl) return alert('请完整填写所有字段');

    log(`🔑 正在启动登录流程：${profile} ...`);
    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profile, loginUrl, verifyUrl })
        });
        const data = await res.json();
        if (data.code === 0) {
            log(`✅ 登录成功，会话 [${profile}] 已保存`);
            refreshProfileSelect();
        } else {
            log('❌ ' + data.msg);
        }
    } catch (e) {
        log('❌ 接口请求异常');
    }
}

async function analyzeResult() {
    const filePath = document.getElementById('analyzePath').value.trim();
    if (!filePath) return alert('请输入 JSON 文件路径');

    log('📊 正在分析：' + filePath);
    try {
        const res = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filePath })
        });
        if (res.ok) {
            const html = await res.text();
            const frame = document.getElementById('reportFrame');
            frame.style.display = 'block';
            frame.srcdoc = html;
            log('✅ 报告已生成');
        } else {
            const data = await res.json();
            log('❌ ' + data.msg);
        }
    } catch (e) {
        log('❌ 接口请求异常');
    }
}

async function fetchHealth() {
    try {
        const res = await fetch('/health');
        const data = await res.json();
        const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1) + ' MB';
        document.getElementById('healthDisplay').innerHTML = `
            <table style="width:100%; border-collapse: collapse;">
                <tr><td style="padding:4px 8px; font-weight:bold;">状态</td><td>✅ 运行中</td></tr>
                <tr><td style="padding:4px 8px; font-weight:bold;">版本</td><td>${data.version}</td></tr>
                <tr><td style="padding:4px 8px; font-weight:bold;">运行时间</td><td>${Math.floor(data.uptime / 60)} 分 ${Math.floor(data.uptime % 60)} 秒</td></tr>
                <tr><td style="padding:4px 8px; font-weight:bold;">平台</td><td>${data.platform}</td></tr>
                <tr><td style="padding:4px 8px; font-weight:bold;">堆内存</td><td>${mb(data.memoryUsage.heapUsed)} / ${mb(data.memoryUsage.heapTotal)}</td></tr>
                <tr><td style="padding:4px 8px; font-weight:bold;">RSS</td><td>${mb(data.memoryUsage.rss)}</td></tr>
                <tr><td style="padding:4px 8px; font-weight:bold;">已存会话</td><td>${data.profileCount}</td></tr>
                <tr><td style="padding:4px 8px; font-weight:bold;">排队任务</td><td>${data.taskQueueLength}</td></tr>
                <tr><td style="padding:4px 8px; font-weight:bold;">活跃浏览器</td><td>${data.activeBrowsers}</td></tr>
            </table>
        `;
    } catch {
        document.getElementById('healthDisplay').innerHTML = '<p style="color:red;">❌ 无法获取服务状态</p>';
    }
}

async function loadProfiles() {
    try {
        const res = await fetch('/api/profiles');
        const data = await res.json();
        const list = document.getElementById('profileList');
        list.innerHTML = '';
        data.data.forEach(p => {
            const li = document.createElement('li');
            li.textContent = p;
            list.appendChild(li);
        });
        if (data.data.length === 0) {
            list.innerHTML = '<li>暂无已保存的会话</li>';
        }
    } catch {
        document.getElementById('profileList').innerHTML = '<li>加载失败</li>';
    }
}
