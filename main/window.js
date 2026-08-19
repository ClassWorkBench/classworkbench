// ============================================
// main/window.js — 主窗口 + 系统托盘管理
// 拆分自 main.js L971-L1066
// 职责：创建 BrowserWindow、注册 close/hide/show 优化钩子、
//       无边框自定义关闭按钮、托盘菜单（显示主界面 / 退出）
// ============================================

const { BROWSER_WINDOW_DEFAULTS } = require('./constants');

/**
 * @param {object} opts
 * @param {object} opts.BrowserWindow - Electron BrowserWindow
 * @param {object} opts.Tray          - Electron Tray
 * @param {object} opts.Menu          - Electron Menu
 * @param {object} opts.path          - Node path
 * @param {object} opts.log           - electron-log
 * @param {string} opts.assetsDir     - 资源根目录（即 __dirname 的上一层，用于找 icon.ico 和 index.html）
 * @param {boolean} opts.startHidden  - 是否以隐藏方式启动（开机自启的 --hidden 参数）
 * @param {{value: boolean}} opts.isQuittingRef - quitting 标记引用，before-quit 时设 true
 * @param {{value: object | null}} opts.trayRef   - 托盘引用的共享存储
 * @param {(mainWindow: BrowserWindow | null) => void} opts.onMainWindowChange - 主窗口指针变化回调，main.js 里通过回调拿到 mainWindow 用于 IPC
 * @param {() => void} opts.beforeShow - 每次"呼出主界面"前回调（main.js 注入：浮窗模式时先退出，实现托盘呼出联动）
 */
function createWindowModule({
    BrowserWindow, Tray, Menu, path, log, assetsDir,
    startHidden, isQuittingRef, trayRef, onMainWindowChange, beforeShow
}) {

    /** 内部缓存的当前主窗口指针，供 showMainWindow 使用 */
    let mainWindow = null;

    function showMainWindow() {
        // 呼出主界面前先执行注入回调（浮窗模式 → 退出浮窗，恢复完整主界面）
        if (typeof beforeShow === 'function') {
            try { beforeShow(); }
            catch (e) { log.warn('[window] beforeShow 回调异常:', e); }
        }
        if (!mainWindow || mainWindow.isDestroyed()) {
            createWindow(true);
            return;
        }
        if (mainWindow.isMinimized()) mainWindow.restore();
        if (!mainWindow.isMaximized()) mainWindow.maximize();
        mainWindow.show();
        mainWindow.focus();
    }

    function createTray() {
        try {
            const iconPath = path.join(assetsDir, 'icon.ico');
            const tray = new Tray(iconPath);
            tray.setToolTip('班级工作台');
            tray.setContextMenu(Menu.buildFromTemplate([
                { label: '显示主界面', click: showMainWindow },
                { type: 'separator' },
                {
                    label: '退出',
                    click: () => {
                        isQuittingRef.value = true;
                        const { app } = require('electron');
                        app.quit();
                    }
                }
            ]));
            tray.on('click', showMainWindow);
            trayRef.value = tray;
        } catch (e) {
            log.error('[tray] 创建失败:', e);
        }
    }

    function createWindow(forceShow = false) {
        const iconPath = path.join(assetsDir, 'icon.ico');
        const htmlPath = path.join(assetsDir, 'index.html');
        const preloadPath = path.join(assetsDir, 'preload.js');

        mainWindow = new BrowserWindow({
            ...BROWSER_WINDOW_DEFAULTS,
            icon: iconPath,
            autoHideMenuBar: true,
            frame: false,
            show: false,
            paintWhenInitiallyHidden: true,
            webPreferences: {
                preload: preloadPath,
                nodeIntegration: false,
                contextIsolation: true,
                // 性能 + 安全优化
                sandbox: true,
                spellcheck: false,
                webgl: false,
                backgroundThrottling: true,
            },
        });

        onMainWindowChange(mainWindow);

        mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
            log.error(`[did-fail-load] ${code} ${desc}  url=${url}`);
        });
        mainWindow.webContents.on('render-process-gone', (_e, details) => {
            log.error('[render-process-gone]', details);
        });

        mainWindow.loadFile(htmlPath);

        mainWindow.once('ready-to-show', () => {
            if (forceShow || !startHidden) {
                mainWindow.maximize();
                mainWindow.show();
            }
        });

        // 有关闭按钮点 X → 不退出，藏到托盘
        mainWindow.on('close', (e) => {
            if (!isQuittingRef.value && trayRef.value) {
                e.preventDefault();
                mainWindow.hide();
            }
        });

        // 性能优化：托盘隐藏时让 Chromium 节流定时器 + 释放资源，显示时恢复
        mainWindow.on('hide', () => {
            if (!mainWindow.isDestroyed()) mainWindow.webContents.setBackgroundThrottling(true);
        });
        mainWindow.on('show', () => {
            if (!mainWindow.isDestroyed()) mainWindow.webContents.setBackgroundThrottling(false);
        });

        mainWindow.on('closed', () => {
            mainWindow = null;
            onMainWindowChange(null);
        });
    }

    return {
        createWindow,
        createTray,
        showMainWindow
    };
}

module.exports = { createWindowModule };
