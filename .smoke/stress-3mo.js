const http = require('http');
const fs = require('fs');
const path = require('path');
const SPEC = '127.0.0.1:9222';
const OUTFILE = path.join(__dirname, 'result-stress-3mo.txt');
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
  const ev = async (expr, awaitPromise) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: !!awaitPromise, returnByValue: true });
    if (r.exceptionDetails) logs.push('EVAL: ' + (r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text));
    return r.result && r.result.value;
  };

  await sleep(1200);

  // ---------- 0) 基线 ----------
  const base = await ev(`({date:AppState.currentViewDate,cards:document.querySelectorAll('.homework-card').length,subjects:AppState.subjectList.length})`);
  result.push('BASE  date=' + base.date + ' cards=' + base.cards + ' subjects=' + base.subjects);

  // ---------- 1) 填充近一年作业（每天 2~5 条、每条大量内容） ----------
  const fillExpr = `(async function(){
    const subjects = AppState.subjectList;
    if(!subjects.length) return {err:'no subjects'};
    const today = AppState.currentViewDate;
    const out = [];
    for(let d=114; d>=0; d--){                       // 115 天 ≈ 3 个月+（8/20 回溯到 4/28，覆盖归档边界 5/1）
      const date = AppUtils.shiftDateStr(today, -d);
      const n = 12 + (d % 5);                       // 每天 12~16 条（超多）
      for(let i=0;i<n;i++){
        const s = subjects[i % subjects.length];
        const long = Array.from({length:18},(_,k)=>'第'+(k+1)+'小题 计算讨论并写明过程').join('；');
        out.push({
          id:'stress3mo_'+d+'_'+i,
          date:date,
          subjectId:s.id,
          subjectName:s.name,
          content:'【'+s.name+'】第'+(i+1)+'组作业：'+long
        });
      }
    }
    AppState.homeworks = out;
    const ok = await AppStorage.persistHomeworks(out);
    return {entries:out.length, todayCount:out.filter(h=>h.date===today).length, ok:!!ok};
  })()`;
  const filled = await ev(fillExpr, true);
  result.push('FILL  ' + JSON.stringify(filled));
  await ev('AppRenderer.renderAll();0');

  // ---------- 1.5) 重新加载触发归档：data:load 会把 5/1 前作业移入 archives ----------
  const reload = await ev(`(async function(){ await AppStorage.loadAll(); AppRenderer.renderAll(); return {active:AppState.homeworks.length, dates:AppState.homeworks.length?[AppState.homeworks[0].date, AppState.homeworks[AppState.homeworks.length-1].date]:[]}; })()`, true);
  result.push('RELOAD ' + JSON.stringify(reload));

  // ---------- 2) 极限压测 A：真实按钮快速连点（同步，M 次 next + M 次 prev） ----------
  const M = 60;
  const t0 = Date.now();
  await ev(`(function(){for(let i=0;i<${M};i++){var b=AppState.dom.dpNext(); if(b)b.click();} for(let i=0;i<${M};i++){var b=AppState.dom.dpPrev(); if(b)b.click();} return ${M};})()`);
  await sleep(1500); // 等最后的动画/清理稳定
  result.push('PRESS A  next+prev=' + (M * 2) + ' clicks, elapsed=' + (Date.now() - t0) + 'ms');
  result.push('  A ' + JSON.stringify(await ev(`(function(){var grid=document.querySelector('.cards-grid');var lay=document.querySelectorAll('.card-slide-layer').length,stuck=0;grid.querySelectorAll('.homework-card').forEach(function(e){if(e.style.transform&&e.style.transform!=='none')stuck++;});return {date:AppState.currentViewDate,cards:grid.querySelectorAll('.homework-card').length,screenLayers:lay,stuckTransform:stuck,gridHeightInlined:!!grid.style.height,gridTransitionLocked:!!grid.style.transition};})()`)));

  // ---------- 3) 极限压测 B：直接 renderAllWithSlide 跨整年快速往复（随机方向, 间隔 20ms） ----------
  const K = 300;
  const s0 = Date.now();
  await ev(`(function(){var start=AppState.currentViewDate; var i=0; var timer=setInterval(function(){
      if(i>=${K}){clearInterval(timer); return;}
      var dir = (Math.random()<0.5)?1:-1;
      AppState.currentViewDate = AppUtils.shiftDateStr(AppState.currentViewDate, dir);
      AppRenderer.renderAllWithSlide(dir);
      i++;
    },20); return start;})()`);
  await sleep(300 * 20 + 1600); // 等全部排完 + 尾帧 + 清理
  result.push('PRESS B  slide-eval x' + K + ' (20ms interval, random dir), elapsed=' + ((Date.now() - s0)) + 'ms');
  result.push('  B ' + JSON.stringify(await ev(`(function(){var grid=document.querySelector('.cards-grid');var lay=document.querySelectorAll('.card-slide-layer').length,stuck=0;grid.querySelectorAll('.homework-card').forEach(function(e){if(e.style.transform&&e.style.transform!=='none')stuck++;});return {date:AppState.currentViewDate,cards:grid.querySelectorAll('.homework-card').length,screenLayers:lay,stuckTransform:stuck,gridHeightInlined:!!grid.style.height,gridTransitionLocked:!!grid.style.transition};})()`)));
  await sleep(2500); // 页面繁忙时最后一帧收尾可能被拖延，延后复检是否最终自动清干净
  result.push('  B-settle ' + JSON.stringify(await ev(`(function(){var grid=document.querySelector('.cards-grid');var lay=document.querySelectorAll('.card-slide-layer').length,stuck=0;grid.querySelectorAll('.homework-card').forEach(function(e){if(e.style.transform&&e.style.transform!=='none')stuck++;});return {date:AppState.currentViewDate,cards:grid.querySelectorAll('.homework-card').length,screenLayers:lay,stuckTransform:stuck,gridHeightInlined:!!grid.style.height,gridTransitionLocked:!!grid.style.transition};})()`)));

  // ---------- 4) 结束态：回到今天并验证 UI 可正常渲染/操作 ----------
  await ev(`AppState.currentViewDate = AppState.currentViewDate; AppRenderer.renderAllWithSlide(1);0`);
  await sleep(1000);
  result.push('END  live=' + JSON.stringify(await ev(`({cards:document.querySelectorAll('.homework-card').length, layers:document.querySelectorAll('.card-slide-layer').length, btnOk:!!AppState.dom.dpNext()})`)));

  result.push('EXCEPTIONS  ' + (logs.length ? ('\n' + logs.join('\n')) : '(none)'));
  write();
  process.exit(0);
})();
