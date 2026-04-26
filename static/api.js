function log(text) {
 const box = document.getElementById("logBox");
 box.innerHTML += `[${new Date().toLocaleTimeString()}] ${text}\n`;
 box.scrollTop = box.scrollHeight;
}

async function runSingle() {
 const url = document.getElementById('urlInput').value.trim();
 if (!url) return alert('请输入网址');
 log('开始采集：' + url);
 try {
 const res = await fetch('/api/run', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ url })
 });
 const data = await res.json();
 if (data.code === 0) {
 log('✅ 采集完成，报告已输出至 output 目录');
 } else {
 log('❌ 采集失败：' + data.msg);
 }
 } catch (e) {
 log('❌ 请求异常');
 }
}

async function runBatch() {
 log('开始执行批量任务...');
 try {
 const res = await fetch('/api/batch');
 const data = await res.json();
 if (data.code === 0) {
 log('✅ 批量任务全部完成');
 } else {
 log('❌ 批量任务失败：' + data.msg);
 }
 } catch (e) {
 log('❌ 请求异常');
 }
}
