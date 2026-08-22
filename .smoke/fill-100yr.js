// ============================================
// fill-100yr.js — 压力测试数据生成：从今天往前 100 年，每天 12~16 条作业
// 活跃部分（最近 3 个月）保留现有数据；归档部分（3 个月前 → 100 年前）
// 按月写入 archives/YYYY-MM.json（AES-256-GCM 加密，tmp+rename 原子写）。
// 运行：electron .smoke/fill-100yr.js（需要真实 safeStorage）
// ============================================

const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');

const userData = path.join(process.env.APPDATA, 'classworkbench');
app.setPath('userData', userData);

const TOTAL_DAYS = 36524;      // 100 年（含今天）
const ACTIVE_DAYS = 90;        // 最近 90 天为活跃（3 个月），之前全部归档

function fmt(d) {
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function shift(d, delta) {
    const nd = new Date(d);
    nd.setDate(nd.getDate() + delta);
    return nd;
}
function longContent(name, i) {
    const long = Array.from({ length: 18 }, (_, k) => '第' + (k + 1) + '小题 计算讨论并写明过程').join('；');
    return '【' + name + '】第' + (i + 1) + '组作业：' + long;
}

app.whenReady().then(async () => {
    const log = { error: console.error, info: console.log, warn: console.warn };
    const { createCipherModule } = require('../main/data-cipher');
    const { createDataStore } = require('../main/data-store');
    const cipher = createCipherModule({ app, fs, path, log, safeStorage });
    const store = createDataStore({ app, fs, path, log, cipher, defaults: {} });
    store.load();
    const subjects = store.get('subjects') || [];
    if (!subjects.length) { console.error('FATAL: no subjects'); app.exit(1); return; }

    const today = new Date();
    const archivesDir = path.join(userData, 'archives');
    if (!fs.existsSync(archivesDir)) fs.mkdirSync(archivesDir, { recursive: true });

    // 按月分组生成（3 个月前 → 100 年前）
    const byMonth = new Map();
    const t0 = Date.now();
    for (let d = ACTIVE_DAYS; d <= TOTAL_DAYS; d++) {
        const date = shift(today, -d);
        const key = fmt(date).slice(0, 7);
        if (!byMonth.has(key)) byMonth.set(key, []);
        const n = 12 + (d % 5);
        const arr = byMonth.get(key);
        for (let i = 0; i < n; i++) {
            const s = subjects[i % subjects.length];
            arr.push({ id: 'y100_a_' + d + '_' + i, date: fmt(date), subjectId: s.id, subjectName: s.name, content: longContent(s.name, i) });
        }
        if (d % 5000 === 0) console.log('生成中 ' + d + '/' + TOTAL_DAYS + ' 天, 月数=' + byMonth.size + ', 耗时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
    }
    console.log('分组完成: ' + byMonth.size + ' 个月, ' + Array.from(byMonth.values()).reduce((a, b) => a + b.length, 0) + ' 条, 耗时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');

    // 按月加密写盘（tmp + rename）
    let written = 0;
    for (const [month, items] of byMonth) {
        const filePath = path.join(archivesDir, month + '.json');
        const encrypted = cipher.encryptText(JSON.stringify(items, null, 2));
        const tmpPath = filePath + '.tmp-' + Date.now();
        fs.writeFileSync(tmpPath, encrypted, 'utf8');
        fs.renameSync(tmpPath, filePath);
        written++;
        if (written % 100 === 0) console.log('写盘 ' + written + '/' + byMonth.size + ', 耗时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
    }

    // 验证：随机抽 3 个月可解密
    let verifyOk = true;
    const samples = [byMonth.keys().next().value, Array.from(byMonth.keys())[Math.floor(byMonth.size / 2)], Array.from(byMonth.keys())[byMonth.size - 1]];
    for (const m of samples) {
        try {
            const raw = fs.readFileSync(path.join(archivesDir, m + '.json'), 'utf8');
            const arr = JSON.parse(cipher.decryptText(raw));
            if (!Array.isArray(arr) || arr.length < 12) verifyOk = false;
        } catch (e) { verifyOk = false; console.error('验证失败:', m, e.message); }
    }
    console.log('验证(3 个月抽样可解密): ' + (verifyOk ? 'OK' : 'FAIL'));
    console.log('DONE 归档文件=' + written + ', 总耗时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
    app.exit(verifyOk ? 0 : 2);
});
