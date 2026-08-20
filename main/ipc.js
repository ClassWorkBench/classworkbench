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
 * @param {object} opts.docsSync   - 协议/文档在线同步模块（readDoc / readBundled / parseVersion / sync）
 * @param {object} opts.qweather   - 和风天气 JWT 客户端（get / generateToken）
 * @param {Function} opts.getMainWindow - 获取当前主窗口（page:copy / 关闭窗口用）
 * @param {Function} opts.getQqConfig - 从 store 取当前 QQ 设置（qq:toggle / qq:updateConfig 用）
 */
function setupIpc({
    ipcMain, clipboard, shell, log, store,
    archive, bg, autoLaunch, sidecar, backup, floating, cipher, docsSync, qweather,
    getMainWindow, getQqConfig, fs, path, app
}) {

    // ===== 数据读写 =====
    // 私有字段（渲染层不应持有明文）掩码。渲染层看到的 settings.qweatherPrivateKey
    // 只可能是该掩码（表示"已配置"），绝不返回明文；写入时用该掩码代表"保持原值"。
    const PRIVATE_KEY_MASK = '*configured*';

    /** data:load 后处理：把敏感私有字段从返回值中剥离为掩码，渲染层只认"已配置与否" */
    function sanitizeForRenderer(data) {
        if (!data || typeof data !== 'object' || !data.settings || typeof data.settings !== 'object') return data;
        const s = Object.assign({}, data.settings);
        if (s.qweatherPrivateKey) {
            s.qweatherPrivateKey = PRIVATE_KEY_MASK;
        }
        return Object.assign({}, data, { settings: s });
    }

    /** data:save 时恢复隐私字段：掩码 → 保留主进程现有值；新值（明文）→ 采用 */
    function mergePrivateKeyOnSave(settings) {
        const key = 'qweatherPrivateKey';
        const current = (store.get('settings') || {})[key];
        if (settings && typeof settings === 'object' && key in settings) {
            if (settings[key] === PRIVATE_KEY_MASK || !settings[key]) {
                // 掩码 或 空 → 保持主进程现有值（用户未改私钥）
                if (current) settings[key] = current;
                else delete settings[key];
            }
            // 否则是用户新填写的明文，直接采用
        }
        return settings;
    }

    ipcMain.handle('data:load', () => sanitizeForRenderer(archive.loadDataInternal()));

    ipcMain.handle('data:save', async (_event, data) => {
        if (!archive.validateData(data)) {
            log.error('[IPC] data:save 参数校验失败');
            return { success: false, error: '参数校验失败' };
        }
        const { homeworks, subjects, settings } = data;
        store.set('homeworks', homeworks || []);
        if (subjects !== undefined) store.set('subjects', subjects);
        if (settings !== undefined) store.set('settings', mergePrivateKeyOnSave(settings));
        await store.flush();   // 加密落盘（串行队列）
        return { success: true };
    });

    // ===== 数据加密状态（设置面板展示） =====
    ipcMain.handle('app:cipherStatus', () => cipher.status());

    // ===== 备份/恢复（备份文件读写；业务组装在渲染层 backup.js） =====
    ipcMain.handle('data:exportBackup', (_event, args) => {
        const a = args || {};
        // 备份是完整可恢复的持久化产物：渲染层 payload 里 qweatherPrivateKey 是掩码，
        // 导出前补上主进程中的真实私钥，确保跨机器/恢复时私钥不丢。
        if (a.payload && a.payload.settings && typeof a.payload.settings === 'object'
            && a.payload.settings.qweatherPrivateKey === PRIVATE_KEY_MASK) {
            const real = (store.get('settings') || {}).qweatherPrivateKey;
            a = Object.assign({}, a, {
                payload: Object.assign({}, a.payload, {
                    settings: Object.assign({}, a.payload.settings, { qweatherPrivateKey: real })
                })
            });
        }
        return backup.exportBackup(a);
    });
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

    // ===== 协议/文档读取（白名单文件名） =====
    // 在线缓存优先（sync 后台已拉取最新），无在线缓存时回退随应用分发的源文件。
    const DOC_FILES = Object.freeze({
        agreement: 'AGREEMENT.md',
        privacy: 'PRIVACY.md',
        security: 'SECURITY.md',
        opensource: 'OPENSOURCE.md',
        contact: 'CONTACT.md'
    });
    ipcMain.handle('docs:read', (_event, name) => {
        if (!DOC_FILES[name]) return null;
        try {
            return docsSync ? docsSync.readDoc(name) : fs.readFileSync(path.join(app.getAppPath(), DOC_FILES[name]), 'utf8');
        } catch (e) {
            log.error(`[docs:read] 读取 ${name} 失败:`, e);
            return null;
        }
    });

    // 在线/内置版本号：renderer 据此判断"已同意版本"是否落后于在线协议版本
    ipcMain.handle('docs:getVersions', () => {
        const names = Object.keys(DOC_FILES);
        const out = { effective: {}, bundled: {}, source: {} };
        for (const n of names) {
            let effContent = null;
            let bundledContent = null;
            try {
                if (docsSync) {
                    effContent = docsSync.readDoc(n);
                    bundledContent = docsSync.readBundled(n);
                } else {
                    effContent = bundledContent = fs.readFileSync(path.join(app.getAppPath(), DOC_FILES[n]), 'utf8');
                }
            } catch (_) { /* 忽略单文档失败 */ }
            out.effective[n] = docsSync ? docsSync.parseVersion(effContent) : '';
            out.bundled[n] = docsSync ? docsSync.parseVersion(bundledContent) : '';
            out.source[n] = docsSync && docsSync.sourceFor ? docsSync.sourceFor(n) : '';
        }
        return out;
    });

    // ===== 和风天气（JWT 认证，主进程签名，渲染层不接触私钥） =====
    // 主进程读取 settings 中的 host/kid/sub/privateKey，生成 JWT 后按 endpooint 请求并返回 JSON。
    ipcMain.handle('qweather:get', async (_event, args) => {
        const { endpoint, query, lat, lon } = args || {};
        const settings = store ? (store.get('settings') || {}) : {};
        const host = settings.qweatherApiHost;
        const cfg = {
            kid: settings.qweatherKid,
            sub: settings.qweatherSub,
            privateKey: settings.qweatherPrivateKey
        };
        if (!qweather) {
            log.error('[qweather] 客户端未初始化');
            return { ok: false, error: 'NO_CLIENT' };
        }
        if (!endpoint) {
            return { ok: false, error: 'NO_ENDPOINT' };
        }
        try {
            const efx = endpoint
                .replace(/\{lat\}/g, String(lat))
                .replace(/\{lon\}/g, String(lon));
            const data = await qweather.get({ host, cfg, endpoint: efx, query });
            return { ok: true, data };
        } catch (e) {
            log.error('[qweather] 请求失败:', e);
            if (e.message === 'NO_CLIENT' || e.message === 'HTTP 403') {
                return { ok: false, error: e.message };
            }
            // 配置缺失/签名失败等统一捕获
            return { ok: false, error: e.message || 'UNKNOWN' };
        }
    });

    // 生成一次 JWT 令牌（供设置面板预览/校验；正常请求走 qweather:get 不要在这里发起）
    ipcMain.handle('qweather:getToken', () => {
        const settings = store ? (store.get('settings') || {}) : {};
        if (!qweather) return { ok: false, error: 'NO_CLIENT' };
        try {
            const token = qweather.generateToken({
                kid: settings.qweatherKid,
                sub: settings.qweatherSub,
                privateKey: settings.qweatherPrivateKey
            });
            return { ok: true, token };
        } catch (e) {
            log.error('[qweather] JWT 生成失败:', e);
            return { ok: false, error: e.message };
        }
    });

    // 生成本地 Ed25519 密钥对（设置界面"一键生成"用）：返回 PEM 私钥 + 公钥
    ipcMain.handle('qweather:genKeyPair', () => {
        if (!qweather || typeof qweather.generateKeyPair !== 'function') {
            return { ok: false, error: 'NO_CLIENT' };
        }
        try {
            return { ok: true, ...qweather.generateKeyPair() };
        } catch (e) {
            log.error('[qweather] 密钥生成失败:', e);
            return { ok: false, error: e.message };
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
