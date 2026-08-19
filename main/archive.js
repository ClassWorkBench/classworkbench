// ============================================
// main/archive.js — 按月归档引擎
// 拆分自 main.js L47-L190
// 职责：3 个月前作业自动归档、原子写入、损坏备份、幂等去重
// ============================================

/**
 * 工厂模式创建归档模块。
 * 注意：atomicWriteRef 是引用对象，atomically 动态 import 完成后会回填 value，
 *       这是为了兼容旧 main.js 里 "先定义 atomicWriteFileSync，再异步加载 atomically" 的时序。
 * @param {object} opts
 * @param {string} opts.archivesDir - 归档目录绝对路径 (userData/archives)
 * @param {Store}  opts.store        - electron-store 实例（homeworks/subjects/settings）
 * @param {{value: Function | null}} opts.atomicWriteRef - 原子写函数引用，初始 null，动态 import 后替换
 * @param {object} opts.fs    - Node fs 模块
 * @param {object} opts.path  - Node path 模块
 * @param {object} opts.log   - electron-log 实例
 * @param {object} opts.cipher - data-cipher 模块实例（归档文件加密落盘）
 * @param {Function} opts.isEncryptionEnabled - () => boolean，用户可选择是否加密
 */
function createArchiveModule({ archivesDir, store, atomicWriteRef, fs, path, log, cipher, isEncryptionEnabled }) {

    const encGetter = typeof isEncryptionEnabled === 'function'
        ? isEncryptionEnabled
        : () => true;

    function getCutoffDate() {
        const d = new Date();
        d.setMonth(d.getMonth() - 3);
        d.setDate(1);
        d.setHours(0, 0, 0, 0);
        return d;
    }

    function getMonthKey(date) {
        const d = new Date(date);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }

    function parseDateLocal(dateStr) {
        const [year, month, day] = String(dateStr).split('-').map(Number);
        return new Date(year, (month || 1) - 1, day || 1);
    }

    /** 原子写入归档文件（加密内容）：优先 atomically，失败降级为"临时文件 + rename" */
    async function atomicWriteFileSync(filePath, data) {
        const content = encGetter() ? cipher.encryptText(data) : data;
        if (atomicWriteRef.value) {
            atomicWriteRef.value(filePath, content, { encoding: 'utf8' });
        } else {
            const tmpPath = filePath + '.tmp-' + Date.now();
            fs.writeFileSync(tmpPath, content, 'utf8');
            fs.renameSync(tmpPath, filePath);
        }
    }

    /** 安全读取归档文件（解密）：密文/JSON 损坏时备份为 .corrupted.<ts>.bak，而非丢弃 */
    async function safeReadArchive(filePath) {
        if (!fs.existsSync(filePath)) return [];
        try {
            const raw = fs.readFileSync(filePath, 'utf8');
            // 兼容两种格式：密文（CBW1:）与明文（历史/关闭加密时）
            const data = JSON.parse(raw.startsWith('CBW1:') ? cipher.decryptText(raw) : raw);
            return Array.isArray(data) ? data : [];
        } catch (e) {
            log.error('归档文件损坏，备份后重置:', filePath, e);
            const ts = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
            const bakPath = filePath.replace('.json', `.corrupted.${ts}.bak`);
            try { fs.renameSync(filePath, bakPath); }
            catch (bakErr) { log.error('备份损坏文件失败:', bakErr); }
            return [];
        }
    }

    /**
     * 执行归档：把 cutoff 日期之前的作业移到 archives/YYYY-MM.json
     * @returns 未归档的"活跃作业"数组
     */
    async function archiveHomeworks(homeworks) {
        const cutoff = getCutoffDate();
        const active = [];
        const toArchive = Object.create(null);

        for (const hw of homeworks) {
            let hwDate;
            if (hw.date) {
                hwDate = parseDateLocal(hw.date);
            } else if (hw.id && hw.id.startsWith('hw_')) {
                const ts = parseInt(hw.id.replace('hw_', ''));
                hwDate = new Date(ts);
            } else {
                hwDate = new Date();
            }
            if (isNaN(hwDate.getTime())) { active.push(hw); continue; }

            if (hwDate >= cutoff) {
                active.push(hw);
            } else {
                const key = getMonthKey(hwDate);
                if (!toArchive[key]) toArchive[key] = [];
                toArchive[key].push(hw);
            }
        }

        for (const [key, items] of Object.entries(toArchive)) {
            const filePath = path.join(archivesDir, `${key}.json`);
            const existing = await safeReadArchive(filePath);
            // 幂等去重：基于作业 id 合并，重复归档不产生重复
            const map = new Map([...existing, ...items].map(h => [h.id, h]));
            try {
                await atomicWriteFileSync(filePath, JSON.stringify([...map.values()], null, 2));
            } catch (e) {
                log.error('写入归档文件失败:', filePath, e);
            }
        }

        return active;
    }

    /** 启动时内部调用：从 store 读作业 → 归档 → 回写活跃作业 → 返回渲染层所需三项 */
    async function loadDataInternal() {
        const rawHomeworks = store.get('homeworks', []);
        const activeHomeworks = await archiveHomeworks(rawHomeworks);
        if (activeHomeworks.length !== rawHomeworks.length) {
            store.set('homeworks', activeHomeworks);
            await store.flush();
        }
        return {
            homeworks: activeHomeworks,
            subjects: store.get('subjects'),
            settings: store.get('settings')
        };
    }

    function getArchiveMonths() {
        if (!fs.existsSync(archivesDir)) return [];
        try {
            return fs.readdirSync(archivesDir)
                .filter(f => /^\d{4}-\d{2}\.json$/.test(f))
                .map(f => f.replace('.json', ''))
                .sort();
        } catch (e) {
            log.error('读取归档月份列表失败:', e);
            return [];
        }
    }

    async function loadArchiveByMonth(monthKey) {
        const filePath = path.join(archivesDir, `${monthKey}.json`);
        return safeReadArchive(filePath);
    }

    /** data:save 参数校验（避免恶意/错误数据搞垮 store） */
    function validateData(data) {
        if (!data || typeof data !== 'object') return false;
        if (data.homeworks !== undefined) {
            if (!Array.isArray(data.homeworks)) return false;
            if (data.homeworks.length > 10000) return false;
        }
        if (data.subjects !== undefined && !Array.isArray(data.subjects)) return false;
        if (data.settings !== undefined && (typeof data.settings !== 'object' || data.settings === null)) return false;
        return true;
    }

    return {
        getCutoffDate,
        getMonthKey,
        parseDateLocal,
        atomicWriteFileSync,
        safeReadArchive,
        archiveHomeworks,
        loadDataInternal,
        getArchiveMonths,
        loadArchiveByMonth,
        validateData
    };
}

module.exports = { createArchiveModule };
