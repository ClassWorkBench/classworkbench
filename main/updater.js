// ============================================
// main/updater.js — 自动更新（electron-updater + GitHub Releases）
// 交互：提示后确认升级——发现新版不自动下载/安装，全部由用户确认。
// 检查：启动静默检查一次 + 设置"关于"面板手动检查。
// 事件：所有状态变化以 updater:event 推给渲染层 { type, ...payload }。
// 安装源：package.json build.publish（GitHub Releases 的 latest.yml）。
// ============================================
const { autoUpdater } = require('electron-updater');

/**
 * @param {object} opts
 * @param {object} opts.app          - Electron app（isPackaged / getVersion）
 * @param {object} opts.log          - electron-log
 * @param {Function} opts.getMainWindow - 获取当前主窗口（事件推送目标）
 */
function createUpdaterModule({ app, log, getMainWindow }) {

    // ---- 当前更新状态（渲染层可随时经 updater:state 拉取） ----
    const state = {
        status: 'idle',        // idle|checking|available|downloading|downloaded|not-available|error
        currentVersion: app.getVersion(),
        version: null,         // 目标新版本
        percent: 0,            // 下载进度 0-100
        error: null
    };

    function emit(type, payload = {}) {
        const w = getMainWindow();
        if (w && !w.isDestroyed()) w.webContents.send('updater:event', { type, ...payload });
    }

    function setup() {
        autoUpdater.logger = log;
        autoUpdater.autoDownload = false;          // 不自动下载，等用户确认
        autoUpdater.autoInstallOnAppQuit = false;  // 安装走显式 quitAndInstall

        autoUpdater.on('checking-for-update', () => {
            state.status = 'checking';
            emit('checking');
        });
        autoUpdater.on('update-available', (info) => {
            state.status = 'available';
            state.version = info.version;
            state.error = null;
            emit('available', { version: info.version });
        });
        autoUpdater.on('update-not-available', (info) => {
            state.status = 'not-available';
            state.version = null;
            emit('not-available', { version: info.version });
        });
        autoUpdater.on('error', (err) => {
            // electron-updater 在"无更新"时也会抛 404 类 error，按状态过滤掉误报
            if (state.status === 'not-available') return;
            state.status = 'error';
            state.error = (err && err.message) || String(err);
            emit('error', { message: state.error });
        });
        autoUpdater.on('download-progress', (p) => {
            state.status = 'downloading';
            state.percent = Math.round((p && p.percent) || 0);
            emit('progress', { percent: state.percent, transferred: p && p.transferred, total: p && p.total });
        });
        autoUpdater.on('update-downloaded', (info) => {
            state.status = 'downloaded';
            state.version = info.version;
            state.percent = 100;
            emit('downloaded', { version: info.version });
        });
    }

    function isDev() {
        return !app.isPackaged;
    }

    /** 检查更新（启动静默 / 手动触发共用）。后续状态靠 updater:event 推送。 */
    async function check() {
        if (isDev()) {
            state.status = 'error';
            state.error = '开发模式不检查更新';
            return { success: false, dev: true, error: state.error };
        }
        try {
            state.status = 'checking';
            state.error = null;
            state.percent = 0;
            await autoUpdater.checkForUpdates();
            return { success: true };
        } catch (e) {
            log.error('[updater] 检查更新失败:', e);
            state.status = 'error';
            state.error = (e && e.message) || String(e);
            return { success: false, error: state.error };
        }
    }

    /** 用户确认后开始下载 */
    function download() {
        if (state.status !== 'available') return { success: false, error: '状态不对' };
        autoUpdater.downloadUpdate();
        return { success: true };
    }

    /** 用户确认后退出应用并安装 */
    function install() {
        if (state.status !== 'downloaded') return { success: false, error: '更新尚未就绪' };
        // before-quit 会停掉 QQ 监听 sidecar，随后启动 NSIS 升级安装
        autoUpdater.quitAndInstall(false, true);
        return { success: true };
    }

    return { setup, check, download, install, getState: () => ({ ...state }), isDev };
}

module.exports = { createUpdaterModule };
