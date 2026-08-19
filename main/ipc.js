// ============================================
// main/ipc.js — IPC 胶水层（13 个 handler）
// 拆分自 main.js L600-L702
// 设计原则：不写业务逻辑，只做"参数校验 → 调各模块方法 → 返回结果"
// 业务逻辑放在 archive/background-cache/sidecar/auto-launch/window 各模块里。
// ============================================

/**
 * @param {object} opts
 * @param {object} opts.ipcMain     - Electron ipcMain
 * @param {object} opts.clipboard   - Electron clipboard（page:copy 用）
 * @param {object} opts.shell       - Electron shell（openExternal 用）
 * @param {object} opts.log         - electron-log
 * @param {Store}  opts.store       - electron-store（data:save 写库）
 * @param {object} opts.archive     - archive 模块实例（loadDataInternal / getArchiveMonths / loadArchiveByMonth / validateData）
 * @param {object} opts.bg          - 背景图模块（pickCachedBackground / pickRandomCachedBackground / fetchAndCacheBackground）
 * @param {object} opts.autoLaunch  - 开机自启模块
 * @param {object} opts.sidecar     - Sidecar 模块
 * @param {object} opts.backup      - 备份/恢复模块（exportBackup / importBackup / createSnapshot / collectArchives / restoreArchives）
 * @param {object} opts.floating    - 浮窗模块（enter / exit / cardReady / getCardForWebContents / closeCard / closeAfterFade）
 * @param {object} opts.cipher      - 数据加密模块（status 供设置面板展示）
 * @param {Function} opts.getMainWindow - 获取当前主窗口（page:copy / 关闭窗口用）
 * @param {Function} opts.getQqConfig - 从 store 取当前 QQ 设置（qq:toggle / qq:updateConfig 用）
 */
function setupIpc({
    ipcMain, clipboard, shell, log, store,
    archive, bg, autoLaunch, sidecar, backup, floating, cipher,
    getMainWindow, getQqConfig, fs, path, app
}) {

    // ===== 数据读写 =====
    ipcMain.handle('data:load', () => archive.loadDataInternal());

    ipcMain.handle('data:save', async (_event, data) => {
        if (!archive.validateData(data)) {
            log.error('[IPC] data:save 参数校验失败');
            return { success: false, error: '参数校验失败' };
        }
        const { homeworks, subjects, settings } = data;
        store.set('homeworks', homeworks || []);
        if (subjects !== undefined) store.set('subjects', subjects);
        if (settings !== undefined) store.set('settings', settings);
        await store.flush();   // 加密落盘（串行队列）
        return { success: true };
    });

    // ===== 数据加密状态（设置面板展示） =====
    ipcMain.handle('app:cipherStatus', () => cipher.status());

    // ===== 备份/恢复（备份文件读写；业务组装在渲染层 backup.js） =====
    ipcMain.handle('data:exportBackup', (_event, args) => backup.exportBackup(args || {}));
    ipcMain.handle('data:importBackup', () => backup.importBackup());
    ipcMain.handle('data:createSnapshot', (_event, data) => backup.createSnapshot(data));
    ipcMain.handle('data:getArchives', () => backup.collectArchives());
    ipcMain.handle('data:restoreArchives', (_event, archives) => backup.restoreArchives(archives));

    // ===== 浮窗模式（画中画） =====
    ipcMain.handle('float:enter', (_event, cards) => floating.enter(cards));
    ipcMain.handle('float:exit', () => floating.exit());
    ipcMain.handle('float:exitAll', () => floating.exit());
    ipcMain.handle('float:init', (event) => floating.getCardForWebContents(event.sender.id));
    ipcMain.handle('float:ready', (event, height) => floating.cardReady(event.sender.id, height));
    ipcMain.handle('float:closeAfterFade', (event) => floating.closeAfterFade(event.sender.id));
    ipcMain.handle('float:dock', (event) => floating.dockCard(event.sender.id));
    ipcMain.handle('float:undock', (event) => floating.undockCard(event.sender.id));
    ipcMain.handle('float:unfade', (event) => floating.unfadeCard(event.sender.id));
    ipcMain.handle('float:refade', (event) => floating.refadeCard(event.sender.id));

    // float:setHoverMode / float:dockPreview / float:dockUnpreview 已废弃（轮询改 mouseenter，无 UI 调用），对应实现已从 floating 模块移除

    // ===== 归档（只读） =====
    ipcMain.handle('archive:getMonths', () => archive.getArchiveMonths());
    ipcMain.handle('archive:loadMonth', (_event, monthKey) => archive.loadArchiveByMonth(monthKey));

    // ===== 背景图缓存 =====
    ipcMain.handle('bg:get', () => {
        const url = bg.pickCachedBackground();
        return url ? { ok: true, url, source: 'cache' } : { ok: false, source: 'none' };
    });

    ipcMain.handle('bg:fetch', async () => {
        const fresh = await bg.fetchAndCacheBackground();
        if (fresh) return fresh;
        const url = bg.pickRandomCachedBackground();
        return url ? { ok: true, url, source: 'cache' } : { ok: false, source: 'none' };
    });

    // ===== QQ Sidecar =====
    ipcMain.handle('qq:toggle', (_event, enabled) => {
        if (enabled) {
            const qqConfig = getQqConfig();
            sidecar.startSidecar(qqConfig);
        } else {
            sidecar.stopSidecar();
        }
        return { success: true };
    });

    ipcMain.handle('qq:getStatus', () => sidecar.getStatus());

    ipcMain.handle('qq:updateConfig', () => {
        const status = sidecar.getStatus();
        if (status.running) {
            sidecar.stopSidecar();
            setTimeout(() => {
                const qqConfig = getQqConfig();
                sidecar.startSidecar(qqConfig);
            }, 300);
        }
        return { success: true };
    });

    // ===== 开机自启 =====
    ipcMain.handle('app:getAutoLaunch', () => ({ success: true, enabled: autoLaunch.getAutoLaunch() }));

    ipcMain.handle('app:setAutoLaunch', (_event, enabled) => {
        try {
            autoLaunch.setAutoLaunch(!!enabled);
            return { success: true };
        } catch (e) {
            log.error('[autoLaunch] 设置失败:', e);
            return { success: false, error: e.message };
        }
    });

    // ===== 窗口控制 =====
    ipcMain.handle('window:close', () => {
        const w = getMainWindow();
        if (w && !w.isDestroyed()) w.close();
        return { success: true };
    });

    // ===== 外部链接 =====
    ipcMain.handle('shell:openExternal', (_event, url) => shell.openExternal(url));

    // 应用版本号（取 package.json 的 version 字段）
    ipcMain.handle('app:getVersion', () => ({ success: true, version: app.getVersion() }));

    // ===== 协议/文档读取（白名单文件名，源文件随应用分发，单一数据源） =====
    const DOC_FILES = Object.freeze({
        agreement: 'AGREEMENT.md',
        privacy: 'PRIVACY.md',
        security: 'SECURITY.md',
        opensource: 'OPENSOURCE.md',
        contact: 'CONTACT.md'
    });
    ipcMain.handle('docs:read', (_event, name) => {
        const file = DOC_FILES[name];
        if (!file) return null;
        try {
            return fs.readFileSync(path.join(app.getAppPath(), file), 'utf8');
        } catch (e) {
            log.error(`[docs:read] 读取 ${file} 失败:`, e);
            return null;
        }
    });

    // ===== 排版成图（页面截图 → 剪贴板位图） =====
    ipcMain.handle('page:copy', async () => {
        const w = getMainWindow();
        if (!w || w.isDestroyed()) return { success: false, error: '窗口不可用' };
        try {
            const image = await w.webContents.capturePage();
            if (image.isEmpty()) return { success: false, error: '截图生成失败' };
            clipboard.writeImage(image);
            return { success: true, copied: true };
        } catch (e) {
            log.error('[page:copy] 复制失败:', e);
            return { success: false, error: e.message || String(e) };
        }
    });
}

module.exports = { setupIpc };
