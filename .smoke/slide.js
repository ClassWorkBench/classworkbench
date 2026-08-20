const http = require('http');
const fs = require('fs');
const path = require('path');
const SPEC = '127.0.0.1:9222';
const OUTFILE = path.join(__dirname, 'result.txt');
fs.mkdirSync(__dirname, { recursive: true });
let WS;
try { WS = globalThis.WebSocket; } catch (e) { }
if (!WS) { try { WS = require('ws'); } catch (e) { } }

function json(p) {
  return new Promise((res, rej) => {
    http.get(`http://${SPEC}${p}`, (r) => {
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
  for (let i = 0; i < 60 && !pages; i++) {
    try { const p = await json('/json'); if (Array.isArray(p) && p.length) pages = p; } catch (e) {}
    if (!pages) await sleep(400);
  }
  if (!pages) { result.push('FAIL: no debugging page on 9222'); write(); process.exit(3); }
  const page = pages.find((p) => p.type === 'page' && /index/.test(p.url)) || pages.find((p) => p.type === 'page');
  if (!page) { result.push('FAIL: no page target'); write(); process.exit(4); }

  const ws = new WS(page.webSocketDebuggerUrl);
  let id = 0; const pend = {}; const logs = [];
  const send = (method, params) => new Promise((res) => { const mid = ++id; pend[mid] = res; ws.send(JSON.stringify({ id: mid, method, params })); });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.exceptionThrown') {
      const ed = m.params.exceptionDetails;
      logs.push('EXC: ' + (ed ? (ed.exception ? ed.exception.description : ed.text) : '?'));
    }
    if (m.id && pend[m.id]) { pend[m.id](m.result); delete pend[m.id]; }
  };
  await new Promise((r) => (ws.onopen = r));
  await send('Runtime.enable');
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: false, returnByValue: true });
    if (r.exceptionDetails) logs.push('EVAL: ' + (r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text));
    return r.result && r.result.value;
  };

  await sleep(1200);
  const boot = await ev(`({boot:(window.AppRenderer&&window.AppState&&window.AppUtils)?1:0, cards:document.querySelectorAll('.homework-card').length})`);
  const d0 = await ev('AppState.currentViewDate');
  result.push('BOOT  boot=' + boot.boot + ' date=' + d0 + ' cards=' + boot.cards);

  const check = `(function(){var grid=document.querySelector('.cards-grid'),nl=grid.querySelectorAll(':scope > .card-slide-layer').length,layers=document.querySelectorAll('.card-slide-layer').length,stuck=0;grid.querySelectorAll('.homework-card').forEach(function(e){if(e.style.transform&&e.style.transform!=='none')stuck++;});return {date:AppState.currentViewDate,cards:document.querySelectorAll('.homework-card').length,screenLayers:layers,stuckTransform:stuck};})()`;

  await ev(`AppState.currentViewDate=AppUtils.shiftDateStr(AppState.currentViewDate,1);AppRenderer.renderAllWithSlide(1);0`);
  await sleep(1100);
  result.push('FWD+1 ' + JSON.stringify(await ev(check)));

  await ev(`AppState.currentViewDate=AppUtils.shiftDateStr(AppState.currentViewDate,-1);AppRenderer.renderAllWithSlide(-1);0`);
  await sleep(1100);
  result.push('BWD-1 ' + JSON.stringify(await ev(check)));

  result.push('LOGS  ' + (logs.length ? '\n' + logs.join('\n') : '(none)'));
  write();
  process.exit(0);
})();