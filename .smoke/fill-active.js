// 补充活跃数据：从今天往前 90 天，每天 12~16 条作业（保留现有 settings/subjects）
const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');
app.setPath('userData', path.join(process.env.APPDATA, 'classworkbench'));

function fmt(d) {
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
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
    const out = [];
    for (let d = 0; d < 90; d++) {
        const date = new Date(today); date.setDate(today.getDate() - d);
        const dateStr = fmt(date);
        const n = 12 + (d % 5);
        for (let i = 0; i < n; i++) {
            const s = subjects[i % subjects.length];
            const long = Array.from({ length: 18 }, (_, k) => '第' + (k + 1) + '小题 计算讨论并写明过程').join('；');
            out.push({ id: 'y100_act_' + d + '_' + i, date: dateStr, subjectId: s.id, subjectName: s.name, content: '【' + s.name + '】第' + (i + 1) + '组作业：' + long });
        }
    }
    store.set('homeworks', out);
    await store.flush();
    console.log('DONE 活跃作业=' + out.length + ', 日期范围 ' + out[out.length - 1].date + ' → ' + out[0].date);
    app.exit(0);
});
