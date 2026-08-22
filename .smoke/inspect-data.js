const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');
app.setPath('userData', path.join(process.env.APPDATA, 'classworkbench'));
app.whenReady().then(async () => {
  const log = { error: console.error, info: () => {}, warn: () => {} };
  const { createCipherModule } = require('../main/data-cipher');
  const cipher = createCipherModule({ app, fs, path, log, safeStorage });
  try {
    const raw = fs.readFileSync(path.join(app.getPath('userData'), 'homework-data.enc'), 'utf8');
    const data = JSON.parse(cipher.decryptText(raw));
    const hw = data.homeworks || [];
    console.log('homeworks 条数:', hw.length);
    if (hw.length) {
      const dates = hw.map(h => h.date);
      console.log('日期范围:', Math.min(...dates), '→', Math.max(...dates));
      console.log('第一条:', JSON.stringify(hw[0]).slice(0, 120));
    }
    console.log('settings 键:', Object.keys(data.settings || {}).join(','));
  } catch (e) { console.log('解密失败:', e.message); }
  console.log('===== 主进程日志 =====');
  const lp = path.join(app.getPath('userData'), 'logs', 'main.log');
  if (fs.existsSync(lp)) console.log(fs.readFileSync(lp, 'utf8'));
  app.exit(0);
});
