// 验证 100 年数据：触发应用重载（扫描归档）+ 获取归档月份数 + 渲染检查
const http = require('http');
const fs = require('fs');
const path = require('path');
const SPEC = '127.0.0.1:9222';
const OUTFILE = path.join(__dirname, 'result-100yr.txt');
let WS;
try { WS = globalThis.WebSocket; } catch (e) {}
if (!WS) { try { WS = require('ws'); } catch (e) {} }

function json(p) {
  return new Promise((res, rej) => {
    http.get('http://' + SPEC + p, (r) => {
      let d = ''; r.on('data', (c) => (d += c));
      r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
    }).on('error', rej);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const result = [];
  const write = () => fs.writeFileSync(OUTFILE, result.join('\n') + '\n');
  if (!WS) { result.push('FATAL no WebSocket'); write(); process.exit(2); }
  let pages = null;
  for (let i = 0; i < 30 && !pages; i++) {
    try { const p = await json('/json'); if (Array.isArray(p) && p.length) pages = p; } catch (e) {}
    if (!pages) await sleep(400);
  }
  if (!pages) { result.push('FAIL: no debugging page'); write(); process.exit(3); }
  const page = pages.find((p) => p.type === 'page' && /index/.test(p.url)) || pages.find((p) => p.type === 'page');
  const ws = new WS(page.webSocketDebuggerUrl);
  let id = 0; const pend = {}; const logs = [];
  const send = (method, params) => new Promise((res) => { const mid = ++id; pend[mid] = res; ws.send(JSON.stringify({ id: mid, method, params })); });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.exceptionThrown') {
      const ed = m.params.exceptionDetails;
      logs.push('EXC: ' + (ed && ed.exception ? ed.exception.description : (ed ? ed.text : '?')));
    }
    if (m.id && pend[m.id]) { pend[m.id](m.result); delete pend[m.id]; }
  };
  await new Promise((r) => (ws.onopen = r));
  await send('Runtime.enable');
  const ev = async (expr, awaitPromise) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: !!awaitPromise, returnByValue: true });
    if (r.exceptionDetails) logs.push('EVAL: ' + (r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text));
    return r.result && r.result.value;
  };
  await sleep(1000);

  const t0 = Date.now();
  result.push('RELOAD ' + JSON.stringify(await ev(`(async function(){ await AppStorage.loadAll(); AppRenderer.renderAll(); return {active:AppState.homeworks.length, subjects:AppState.subjectList.length, date:AppState.currentViewDate, cards:document.querySelectorAll('.homework-card').length}; })()`, true)));
  result.push('RELOAD elapsed=' + (Date.now() - t0) + 'ms');

  const t1 = Date.now();
  result.push('MONTHS ' + JSON.stringify(await ev(`(async function(){ const m = await window.electronAPI.archiveGetMonths(); return {count: m.length, first: m[0], last: m[m.length-1]}; })()`, true)));
  result.push('MONTHS elapsed=' + (Date.now() - t1) + 'ms');

  const t2 = Date.now();
  result.push('LOADMONTH ' + JSON.stringify(await ev(`(async function(){ const m = await window.electronAPI.archiveGetMonths(); const mid = m[Math.floor(m.length/2)]; const arr = await window.electronAPI.archiveLoadMonth(mid); return {month: mid, count: arr.length}; })()`, true)));
  result.push('LOADMONTH elapsed=' + (Date.now() - t2) + 'ms');

  result.push('EXCEPTIONS ' + (logs.length ? '\n' + logs.join('\n') : '(none)'));
  write();
  console.log(result.join('\n'));
  process.exit(0);
})();
