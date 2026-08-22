// 100 年数据下的切日期压力（不修改数据）
const http = require('http');
const fs = require('fs');
const path = require('path');
const OUTFILE = path.join(__dirname, 'result-switch-100yr.txt');
let WS; try { WS = globalThis.WebSocket; } catch (e) {}
const json = (p) => new Promise((res, rej) => { http.get('http://127.0.0.1:9222' + p, (r) => { let d=''; r.on('data', c=>d+=c); r.on('end', () => { try { res(JSON.parse(d)); } catch(e){ rej(e); } }); }).on('error', rej); });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const result = [];
  const write = () => fs.writeFileSync(OUTFILE, result.join('\n') + '\n');
  let pages; for (let i=0;i<30&&!pages;i++){ try { const p=await json('/json'); if (Array.isArray(p)&&p.length) pages=p; } catch(e){} if(!pages) await sleep(400); }
  const page = pages.find(p=>p.type==='page'&&/index/.test(p.url)) || pages.find(p=>p.type==='page');
  const ws = new WS(page.webSocketDebuggerUrl);
  let id=0; const pend={}; const logs=[];
  const send=(method,params)=>new Promise(res=>{const mid=++id; pend[mid]=res; ws.send(JSON.stringify({id:mid,method,params}));});
  ws.onmessage=(ev)=>{ const m=JSON.parse(ev.data);
    if (m.method==='Runtime.exceptionThrown'){ const ed=m.params.exceptionDetails; logs.push('EXC: '+(ed&&ed.exception?ed.exception.description:(ed?ed.text:'?'))); }
    if (m.id&&pend[m.id]){ pend[m.id](m.result); delete pend[m.id]; } };
  await new Promise(r=>ws.onopen=r);
  await send('Runtime.enable');
  const ev=async(expr,aw)=>{ const r=await send('Runtime.evaluate',{expression:expr,awaitPromise:!!aw,returnByValue:true});
    if (r.exceptionDetails) logs.push('EVAL: '+(r.exceptionDetails.exception?r.exceptionDetails.exception.description:r.exceptionDetails.text));
    return r.result&&r.result.value; };
  await sleep(1000);
  const check = `(function(){var grid=document.querySelector('.cards-grid'),lay=document.querySelectorAll('.card-slide-layer').length,stuck=0;grid.querySelectorAll('.homework-card').forEach(function(e){if(e.style.transform&&e.style.transform!=='none')stuck++;});return {date:AppState.currentViewDate,cards:grid.querySelectorAll('.homework-card').length,screenLayers:lay,stuckTransform:stuck};})()`;
  result.push('BASE ' + JSON.stringify(await ev(check)));
  const M = 60;
  const t0 = Date.now();
  await ev(`(function(){for(var i=0;i<${M};i++){var b=AppState.dom.dpNext();if(b)b.click();}for(var i=0;i<${M};i++){var b=AppState.dom.dpPrev();if(b)b.click();}return ${M};})()`);
  await sleep(1500);
  result.push('PRESS A next+prev=' + (M*2) + ' clicks elapsed=' + (Date.now()-t0) + 'ms');
  result.push('  A ' + JSON.stringify(await ev(check)));
  const K = 150;
  await ev(`(function(){var i=0;var timer=setInterval(function(){if(i>=${K}){clearInterval(timer);return;}var dir=(Math.random()<0.5)?1:-1;AppState.currentViewDate=AppUtils.shiftDateStr(AppState.currentViewDate,dir);AppRenderer.renderAllWithSlide(dir);i++;},20);return 1;})()`);
  await sleep(150*20+1600);
  result.push('PRESS B slide-eval x' + K);
  result.push('  B ' + JSON.stringify(await ev(check)));
  await sleep(2000);
  result.push('  B-settle ' + JSON.stringify(await ev(check)));
  result.push('EXCEPTIONS ' + (logs.length ? '\n'+logs.join('\n') : '(none)'));
  write();
  console.log(result.join('\n'));
  process.exit(0);
})();
