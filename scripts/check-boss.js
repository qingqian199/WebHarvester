const fs = require('fs');
const d = JSON.parse(fs.readFileSync('output/boss_zhipin/combined-1777731995557.json','utf-8'));
d.forEach(function(r) {
  var msg = r.unit + ': ' + r.status + ' (' + r.responseTime + 'ms)';
  if (r.data && typeof r.data === 'object') {
    msg += ' code=' + r.data.code;
    if (r.data.message) msg += ' msg=' + r.data.message;
    if (r.data.zpData && Array.isArray(r.data.zpData)) msg += ' items=' + r.data.zpData.length;
    if (r.data.title) msg += ' page=' + r.data.title;
  }
  if (r.error) msg += ' error=' + r.error;
  console.log(msg);
});
