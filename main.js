// ============================================
// main.js  (Electron 主进程)  —— 启动编排层
// 拆分后约 150 行。业务逻辑已下沉到 main/ 下各领域模块：
//   main/constants.js       — 共享常量（BG/自启注册表/Sidecar阈值/窗口尺寸）
//   main/archive.js         — 按月归档（原子写入/损坏备份/幂等去重）
//   main/background-cache.js— 背景图本地缓存（魔数校验/索引/下载驱逐）
//   main/auto-launch.js     — 开机自启 + 开发版自启清理
//   main/sidecar.js         — QQ Sidecar 进程管理（崩溃退避/竞态修复）
//   main/window.js          — BrowserWindow + Tray + 钩子
//   main/floating.js        — 浮窗模式（画中画：每卡一窗，置顶可拖）
//   main/ipc.js             — 32 个 IPC 胶水层 handler（无业务）
// ============================================

const { app, BrowserWindow, ipcMain, Tray, Menu, net, clipboard, shell, dialog, screen, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const { spawn, execSync, execFileSync } = require('child_process');
const log = require('electron-log');

// ---- 模块工厂 ----
const { STORE_DEFAULTS } = require('./main/constants');
const { createArchiveModule } = require('./main/archive');
const { createBgCacheModule } = require('./main/background-cache');
const { createAutoLaunchModule } = require('./main/auto-launch');
const { createSidecarModule } = require('./main/sidecar');
const { createBackupModule } = require('./main/backup');
const { createFloatingModule } = require('./main/floating');
const { createCipherModule } = require('./main/data-cipher');
const { createDataStore } = require('./main/data-store');
const { createWindowModule } = require('./main/window');
const { createDocsSync } = require('./main/docs-sync');
const { createQweatherClient } = require('./main/qweather-auth');
const { createSystemTransparencyModule } = require('./main/system-transparency');
const { setupIpc } = require('./main/ipc');

// ============================================
// 性能优化：V8 / Chromium 启动参数（必须在 whenReady() 之前注入）
// ============================================
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=256');
app.commandLine.appendSwitch('enable-features', 'BackForwardCache:memory_limit_in_percent/10');
app.commandLine.appendSwitch('memory-pressure-offloading');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');

// ---- 全局异常捕获 ----
process.on('uncaughtException', (err) => log.error('[uncaughtException]', err));
process.on('unhandledRejection', (reason) => log.error('[unhandledRejection]', reason));

// ---- 单实例锁 ----
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {

    // ===== 跨模块共享的引用（用对象包装，方便异步赋值后模块也能读到） =====
    const mainWindowRef = { value: null };
    const isQuittingRef = { value: false };
    const trayRef = { value: null };
    const atomicWriteRef = { value: null };

    const startHidden = process.argv.includes('--hidden');
    const archivesDir = path.join(app.getPath('userData'), 'archives');

    // ====== 各领域模块实例（先声明，whenReady 里 store/atomicWrite 就绪后 new 出来） ======
    let archive = null;
    let bg = null;
    let autoLaunch = null;
    let sidecar = null;
    let backup = null;
    let floating = null;
    let cipher = null;
    let store = null;
    let windowMod = null;
    let docsSync = null;
    let qweather = null;
    let sysTransparency = null;

    // ---- 主窗口变化时把引用同步给 mainWindowRef（供 IPC/second-instance 调用） ----
    function onMainWindowChange(w) { mainWindowRef.value = w; }

    // ---- Sidecar 事件 → 转发给渲染层（sidecar 模块本身不依赖窗口） ----
    function emitToRenderer(event, data) {
        const w = mainWindowRef.value;
        if (w && !w.isDestroyed()) w.webContents.send(event, data);
    }

    // ---- 从 store 取 QQ settings（供 IPC 用） ----
    function getQqConfig() {
        let store = null;
        // 这个 getter 在 whenReady 之后才会被 qq:toggle/qq:updateConfig 调用，
        // 但为了稳妥，仍通过闭包拿 app 里的 storeRef。下面初始化时再赋值。
        store = getQqConfig._store;
        const settings = store ? (store.get('settings') || {}) : {};
        return settings.qq || {};
    }

    // ============================================
    // 生命周期钩子（second-instance 注册必须放在 whenReady 前）
    // ============================================
    app.on('second-instance', (_event, argv) => {
        if (argv.includes('--hidden')) return; // 开机自启的隐藏实例不要把已运行实例顶出来
        const w = mainWindowRef.value;
        if (w) w.setAlwaysOnTop(true, 'screen-saver');
        if (windowMod) windowMod.showMainWindow();
        if (w) w.setAlwaysOnTop(false);
    });

    app.whenReady().then(async () => {
        // ---- 数据加密：AES-256-GCM，密钥由 Windows 凭据保护（DPAPI） ----
        // 系统加密不可用（极端情况）时降级明文并如实暴露状态，绝不让应用无法启动。
        try {
            cipher = createCipherModule({ app, fs, path, log, safeStorage });
            cipher.status();   // 提前校验密钥可用性
        } catch (e) {
            log.error('[cipher] 系统加密不可用，数据将以明文存储（状态会如实显示）:', e);
            cipher = {
                encryptText: (t) => String(t),
                decryptText: (t) => String(t),
                status: () => ({ enabled: false, algorithm: '无（系统加密不可用，降级明文）', keyProtection: '不可用', keyFile: '' })
            };
        }

        // 加密开关：settings.dataEncryption !== false 即启用（向导可选择，默认开启）
        const isEncryptionEnabled = () => {
            const s = store ? store.get('settings') : null;
            return !s || s.dataEncryption !== false;
        };

        // ---- 加密数据存储（替代 electron-store）：内存读写 + 按开关加密/明文落盘 ----
        store = createDataStore({ app, fs, path, log, cipher, defaults: STORE_DEFAULTS, isEncryptionEnabled });
        store.load();   // 旧明文自动迁移 + 损坏自愈
        getQqConfig._store = store;

        try {
            const atomically = await import('atomically');
            atomicWriteRef.value = atomically.writeFileSync;
        } catch (e) {
            log.warn('atomically 加载失败，降级为手动原子写:', e);
        }

        if (!fs.existsSync(archivesDir)) fs.mkdirSync(archivesDir, { recursive: true });

        // ---- 各模块工厂实例化，显式依赖注入 ----
        archive = createArchiveModule({ archivesDir, store, atomicWriteRef, fs, path, log, cipher, isEncryptionEnabled });
        // 背景图缓存索引为明文内部文件（无隐私价值），使用独立的明文原子写，
        // 不经过 archive 的加密写入（避免索引被加密后自身无法读取）。
        const plainAtomicWrite = (filePath, data) => {
            if (atomicWriteRef.value) {
                atomicWriteRef.value(filePath, data, { encoding: 'utf8' });
            } else {
                const tmpPath = filePath + '.tmp-' + Date.now();
                fs.writeFileSync(tmpPath, data, 'utf8');
                fs.renameSync(tmpPath, filePath);
            }
        };
        bg = createBgCacheModule({
            app, fs, path, crypto, net, pathToFileURL, log,
            atomicWriteFileSync: plainAtomicWrite,
            getSettings: () => store.get('settings') || null
        });
        autoLaunch = createAutoLaunchModule({ app, fs, path, execFileSync, log });

        backup = createBackupModule({ app, dialog, fs, path, log, store, archive, cipher, isEncryptionEnabled });

        sidecar = createSidecarModule({
            app, fs, path, log, spawn, execSync,
            callbacks: { emit: emitToRenderer }
        });

        windowMod = createWindowModule({
            BrowserWindow, Tray, Menu, path, log,
            assetsDir: __dirname,
            startHidden, isQuittingRef, trayRef,
            onMainWindowChange,
            // 呼出主界面时保留浮窗（画中画共存）：退出浮窗只走显式入口（横幅/更多菜单）
            beforeShow: () => {}
        });

        floating = createFloatingModule({
            BrowserWindow, screen, path, log,
            assetsDir: __dirname,
            getMainWindow: () => mainWindowRef.value,
            showMainWindow: () => windowMod.showMainWindow(),
            isQuitting: () => isQuittingRef.value,
            emit: emitToRenderer
        });

        // 协议/文档在线同步（三级兜底 + SHA-256 比对 + 本地缓存），不阻塞启动
        docsSync = createDocsSync({ app, fs, path, crypto, net, log });

        // 和风天气 JWT 认证客户端（主进程签名，渲染层不接触私钥）
        qweather = createQweatherClient({ net, log });

        // Windows「透明效果」检测：系统关闭透明时同步关闭软件内毛玻璃
        sysTransparency = createSystemTransparencyModule({
            execFileSync, log,
            emit: (event, data) => emitToRenderer(event, data)
        });

        // ---- IPC 胶水层 ----
        setupIpc({
            ipcMain, clipboard, shell, log, store,
            archive, bg, autoLaunch, sidecar, backup, floating, cipher, docsSync,
            qweather,
            getMainWindow: () => mainWindowRef.value,
            getQqConfig,
            fs, path, app
        });

        // 系统透明效果查询（供渲染层启动时拉取初始值，防止错过首次推送）
        ipcMain.handle('app:getSystemTransparency', () => ({
            ok: true,
            enabled: sysTransparency ? sysTransparency.getEnabled() : null
        }));

        // ---- 启动就绪后的一次性初始化 ----
        bg.cleanupBgCache();

        const hadDevAutoLaunch = autoLaunch.removeDevAutoLaunchEntry();
        if (hadDevAutoLaunch || autoLaunch.getAutoLaunch()) {
            try { autoLaunch.setAutoLaunch(true); }
            catch (e) { log.warn('[autoLaunch] 刷新登录项失败:', e); }
        }

        windowMod.createWindow();
        windowMod.createTray();

        // 主窗口就绪后开始监听系统透明效果（渲染层已可订阅推送）
        if (sysTransparency) sysTransparency.start();

        // 后台异步同步协议/文档（不阻塞界面）；变了则通知渲染层展示最新/重弹协议
        docsSync.sync().then((summary) => {
            if (summary && summary.changed && summary.changed.length) {
                emitToRenderer('docs:updated', summary);
            }
        }).catch((e) => log.error('[docs-sync] 后台同步失败:', e));
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) windowMod.createWindow(true);
        else windowMod.showMainWindow();
    });

    app.on('window-all-closed', () => {
        if (sidecar) sidecar.stopSidecar();
        if (process.platform !== 'darwin') app.quit();
    });

    app.on('before-quit', () => {
        isQuittingRef.value = true;
        if (sidecar) sidecar.stopSidecar();
    });
}
