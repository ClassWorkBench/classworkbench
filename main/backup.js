// ============================================
// main/backup.js — 备份与恢复（文件读写）
// 职责：导出 JSON（保存对话框）、导入 JSON（打开对话框）、
//       恢复前自动快照、归档数据收集/写回。
// 业务组装在渲染层 backup.js，本模块只做"对话框 + 文件读写 + 归档合并"。
// ============================================

/**
 * 工厂模式创建备份模块。
 * @param {object} opts
 * @param {object} opts.app     - Electron app（取 userData 路径）
 * @param {object} opts.dialog  - Electron dialog（保存/打开对话框）
 * @param {object} opts.fs      - Node fs
 * @param {object} opts.path    - Node path
 * @param {object} opts.log     - electron-log
 * @param {Store}  opts.store   - electron-store（快照兜底）
 * @param {object} opts.archive - 归档模块实例（月份列表/安全读取/原子写入）
 * @param {object} opts.cipher  - data-cipher 模块实例（快照加密落盘；导出/导入备份保持明文）
 * @param {Function} opts.isEncryptionEnabled - () => boolean，快照跟随用户加密开关
 */
function createBackupModule({ app, dialog, fs, path, log, store, archive, cipher, isEncryptionEnabled }) {

    const ARCHIVE_MONTH_RE = /^\d{4}-\d{2}$/;
    const encGetter = typeof isEncryptionEnabled === 'function'
        ? isEncryptionEnabled
        : () => true;

    function getSnapshotDir() {
        return path.join(app.getPath('userData'), 'restore-snapshots');
    }

    /** 原子写 JSON：临时文件 + rename，防止写入中断损坏 */
    function safeWriteJson(filePath, payload) {
        const tmpPath = filePath + '.tmp-' + Date.now();
        fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2), 'utf8');
        fs.renameSync(tmpPath, filePath);
    }

    /** 原子写加密 JSON（本机快照用；备份导出保持明文，方便跨机器/网盘） */
    function writeEncryptedJson(filePath, payload) {
        const content = encGetter()
            ? cipher.encryptText(JSON.stringify(payload, null, 2))
            : JSON.stringify(payload, null, 2);
        const tmpPath = filePath + '.tmp-' + Date.now();
        fs.writeFileSync(tmpPath, content, 'utf8');
        fs.renameSync(tmpPath, filePath);
    }

    /** 导出备份：弹保存对话框，用户自选路径 */
    async function exportBackup({ suggestedName, payload } = {}) {
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            return { success: false, error: '备份内容无效' };
        }
        const result = await dialog.showSaveDialog({
            title: '导出备份',
            defaultPath: suggestedName || '班级工作台备份.json',
            filters: [{ name: 'JSON 备份', extensions: ['json'] }]
        });
        if (result.canceled || !result.filePath) {
            return { success: false, canceled: true };
        }
        try {
            safeWriteJson(result.filePath, payload);
            return { success: true, filePath: result.filePath };
        } catch (e) {
            log.error('[backup] 导出失败:', e);
            return { success: false, error: e.message || String(e) };
        }
    }

    /** 导入备份：弹打开对话框，读取并解析 JSON */
    async function importBackup() {
        const result = await dialog.showOpenDialog({
            title: '导入备份',
            properties: ['openFile'],
            filters: [{ name: 'JSON 备份', extensions: ['json'] }]
        });
        if (result.canceled || !result.filePaths || !result.filePaths[0]) {
            return { success: false, canceled: true };
        }
        const filePath = result.filePaths[0];
        try {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            if (!data || typeof data !== 'object' || Array.isArray(data)) {
                return { success: false, error: '备份文件格式无效' };
            }
            return { success: true, data, filePath };
        } catch (e) {
            log.error('[backup] 导入失败:', filePath, e);
            return { success: false, error: e.message || String(e) };
        }
    }

    /**
     * 恢复前自动快照当前数据（写入 userData/restore-snapshots/）。
     * 优先使用渲染层传来的最新内存数据，缺省时回落 electron-store。
     */
    async function createSnapshot(data) {
        try {
            const dir = getSnapshotDir();
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            const ts = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15);
            const filePath = path.join(dir, `restore-${ts}.json`);
            const snapshot = {
                app: 'classworkbench',
                version: 1,
                kind: 'snapshot',
                createdAt: new Date().toISOString(),
                data: {
                    settings: (data && data.settings) || store.get('settings'),
                    subjects: (data && data.subjects) || store.get('subjects'),
                    homeworks: (data && data.homeworks) || store.get('homeworks')
                }
            };
            writeEncryptedJson(filePath, snapshot);
            return { success: true, filePath };
        } catch (e) {
            log.error('[backup] 自动快照失败:', e);
            return { success: false, error: e.message || String(e) };
        }
    }

    /** 收集全部归档：{ 'YYYY-MM': [homeworks] }，供备份作业时一并导出 */
    async function collectArchives() {
        const out = {};
        for (const monthKey of archive.getArchiveMonths()) {
            out[monthKey] = await archive.loadArchiveByMonth(monthKey);
        }
        return out;
    }

    /** 写回归档：按月份文件合并（id 去重），月份 key 白名单校验 */
    async function restoreArchives(archives) {
        if (!archives || typeof archives !== 'object' || Array.isArray(archives)) {
            return { success: false, error: '归档数据无效' };
        }
        const archivesDir = path.join(app.getPath('userData'), 'archives');
        let restoredCount = 0;
        let monthCount = 0;
        for (const [monthKey, items] of Object.entries(archives)) {
            if (!ARCHIVE_MONTH_RE.test(monthKey) || !Array.isArray(items)) continue;
            const filePath = path.join(archivesDir, `${monthKey}.json`);
            const existing = await archive.safeReadArchive(filePath);
            const map = new Map();
            for (const hw of [...existing, ...items]) {
                if (hw && typeof hw === 'object' && hw.id !== undefined) map.set(hw.id, hw);
            }
            try {
                await archive.atomicWriteFileSync(filePath, JSON.stringify([...map.values()], null, 2));
                restoredCount += items.length;
                monthCount++;
            } catch (e) {
                log.error('[backup] 写回归档失败:', filePath, e);
            }
        }
        return { success: true, restoredCount, monthCount };
    }

    return {
        exportBackup,
        importBackup,
        createSnapshot,
        collectArchives,
        restoreArchives
    };
}

module.exports = { createBackupModule };
