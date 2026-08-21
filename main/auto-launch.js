// ============================================
// main/auto-launch.js — 开机自启管理
// 拆分自 main.js L539-L598
// 职责：getLoginItemSettings / setLoginItemSettings 封装、
//       打包版清理开发版（electron.exe 裸）自启项，防两实例同启
// ============================================

const { RUN_KEY } = require('./constants');

/**
 * @param {object} opts
 * @param {object} opts.app           - Electron app
 * @param {object} opts.fs            - Node fs
 * @param {object} opts.path          - Node path
 * @param {Function} opts.execFileSync - child_process.execFileSync
 * @param {object} opts.log           - electron-log
 */
function createAutoLaunchModule({ app, fs, path, execFileSync, log }) {

    /** 自启目标路径：打包版用 process.execPath；开发版优先已打包 exe，没有就继续用 electron.exe */
    function getPreferredAutoLaunchPath() {
        if (app.isPackaged) return process.execPath;
        const packagedExe = path.join(__dirname, '..', 'dist', 'win-unpacked', 'ClassWorkBench.exe');
        return fs.existsSync(packagedExe) ? packagedExe : process.execPath;
    }

    function getAutoLaunchArgs(launchPath) {
        // 开发模式直接启动 electron.exe 时要带上项目路径，否则起空白壳
        if (!app.isPackaged && launchPath === process.execPath) {
            return [app.getAppPath(), '--hidden'];
        }
        return ['--hidden'];
    }

    function getAutoLaunch() {
        if (process.platform !== 'win32') return false;
        const launchPath = getPreferredAutoLaunchPath();
        return Boolean(app.getLoginItemSettings({
            path: launchPath,
            args: getAutoLaunchArgs(launchPath)
        }).openAtLogin);
    }

    function setAutoLaunch(enabled) {
        const launchPath = getPreferredAutoLaunchPath();
        const args = getAutoLaunchArgs(launchPath);
        app.setLoginItemSettings({
            openAtLogin: !!enabled,
            path: launchPath,
            args
        });
    }

    /** 打包版启动时扫 RUN 注册表，把"项目根目录下的 electron.exe"旧自启项删掉 */
    function removeDevAutoLaunchEntry() {
        if (process.platform !== 'win32' || !app.isPackaged) return false;
        let removed = false;
        // 打包后资源路径 dist/win-unpacked/resources/app.asar 或 app，项目根是其上两层
        const projectRoot = path.dirname(path.dirname(__dirname)).toLowerCase();
        try {
            const output = execFileSync('reg', ['query', RUN_KEY], { encoding: 'utf8', windowsHide: true });
            for (const line of output.split(/\r?\n/)) {
                const match = line.match(/^\s*(.+?)\s+REG_[A-Z_]+\s+(.*)$/);
                if (!match) continue;
                const name = match[1].trim();
                const value = match[2].trim();
                const lowerValue = value.toLowerCase();
                if (lowerValue.includes('node_modules\\electron\\dist\\electron.exe') && lowerValue.includes(projectRoot)) {
                    execFileSync('reg', ['delete', RUN_KEY, '/v', name, '/f'], { stdio: 'ignore', windowsHide: true });
                    log.info(`[autoLaunch] 已清理开发版自启项: ${name}`);
                    removed = true;
                }
            }
        } catch (e) {
            log.warn('[autoLaunch] 清理开发版自启项失败:', e.message || e);
        }
        return removed;
    }

    return {
        getPreferredAutoLaunchPath,
        getAutoLaunchArgs,
        getAutoLaunch,
        setAutoLaunch,
        removeDevAutoLaunchEntry
    };
}

module.exports = { createAutoLaunchModule };
