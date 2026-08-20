// ============================================
// main/sidecar.js — QQ Sidecar (C# qq-listener.exe) 进程管理
// 拆分自 main.js L705-L969（第二大坨，264 行）
// 职责：进程启停、stdout NDJSON 解析、指数退避崩溃重启、
//       expectedPid 竞态修复、Homework→Notification 兼容转换。
// 注意：本模块不依赖 BrowserWindow，所有 IPC 事件通过 callbacks.emit() 抛给上层，
//       由 main.js 统一转发到渲染层，保持模块可测试、可复用。
// ============================================

const {
    SIDECAR_MAX_CONSECUTIVE_CRASHES,
    SIDECAR_STDOUT_MAX_BYTES
} = require('./constants');

/**
 * @param {object} opts
 * @param {object} opts.app           - Electron app（获取 temp 路径）
 * @param {object} opts.fs            - Node fs
 * @param {object} opts.path          - Node path
 * @param {object} opts.log           - electron-log
 * @param {Function} opts.spawn       - child_process.spawn
 * @param {Function} opts.execSync    - child_process.execSync（taskkill 杀进程树）
 * @param {object} opts.callbacks     - 事件回调集合
 * @param {(event: string, data?: any) => void} opts.callbacks.emit - 把 qq:* 事件往外抛，由 main.js 负责 webContents.send
 */
function createSidecarModule({
    app, fs, path, log, spawn, execSync, callbacks
}) {

    // ===== 模块内部状态 =====
    let sidecarProcess = null;
    let sidecarExpectedPid = null;
    let sidecarLastError = null;
    let sidecarRestartTimer = null;
    let sidecarShouldRun = false;
    let lastSidecarConfig = null;
    let sidecarConsecutiveCrashes = 0;
    let sidecarConfigPath = null;

    function getSidecarBackoffMs() {
        // 指数退避：3 → 6 → 12 → 24 → 48 → 96 → 192 → 384 秒
        const base = 3000;
        return base * Math.pow(2, Math.min(sidecarConsecutiveCrashes, 7));
    }

    function getSidecarPath() {
        // 1. 打包版：resourcesPath/sidecar/qq-listener.exe（extraResources 复制）
        const prodPath = path.join(process.resourcesPath || '', 'sidecar', 'qq-listener.exe');
        if (fs.existsSync(prodPath)) return prodPath;

        // 2. 开发版：按优先级从 sidecar/qq-listener/bin 下找 Release publish/Release/Debug
        const devBase = path.join(__dirname, '..', 'sidecar', 'qq-listener', 'bin');
        const devCandidates = [
            path.join(devBase, 'Release', 'net8.0-windows10.0.19041.0', 'win-x64', 'publish', 'qq-listener.exe'),
            path.join(devBase, 'Release', 'net8.0-windows10.0.19041.0', 'qq-listener.exe'),
            path.join(devBase, 'Debug', 'net8.0-windows10.0.19041.0', 'qq-listener.exe'),
        ];
        for (const p of devCandidates) {
            if (fs.existsSync(p)) return p;
        }
        return prodPath; // 找不到就返回最后一个，启动时会报"找不到 sidecar"
    }

    function buildSidecarConfig(qqConfig) {
        const cfg = qqConfig || {};
        // teachers 对象数组 → 只需要昵称字符串
        const teachers = Array.isArray(cfg.teachers)
            ? cfg.teachers.map(t => (typeof t === 'string' ? t : t?.name)).filter(Boolean)
            : [];
        return {
            scanIntervalSeconds: cfg.scanIntervalSeconds ?? 0.5,
            cooldownSeconds: cfg.cooldownSeconds ?? 3,
            qqOnly: cfg.qqOnly ?? true,
            teachers
        };
    }

    function getStatus() {
        return {
            running: sidecarProcess !== null && !sidecarProcess.killed,
            pid: sidecarProcess ? sidecarProcess.pid : null,
            lastError: sidecarLastError
        };
    }

    /** 解析 stdout 单行 JSON，并按事件类型分发 */
    function handleSidecarLine(line) {
        let evt;
        try { evt = JSON.parse(line); }
        catch (e) { log.warn('[sidecar] 无法解析 JSON:', line); return; }

        switch (evt.type) {
            case 'Ready':
                sidecarConsecutiveCrashes = 0;
                callbacks.emit('qq:ready', { ts: evt.ts });
                callbacks.emit('qq:status', { running: true, pid: sidecarProcess ? sidecarProcess.pid : null, lastError: null });
                break;
            case 'Notification':
                callbacks.emit('qq:notification', evt.data);
                break;
            case 'Homework':
                // 兼容旧版/自定义 sidecar：Homework 事件 → Notification 结构，让渲染层统一识别
                log.info('[sidecar] 收到 Homework 事件，转交渲染层识别', evt.data);
                if (evt.data && (evt.data.rawMessage || evt.data.content)) {
                    callbacks.emit('qq:notification', {
                        sender: evt.data.sender || '',
                        message: evt.data.rawMessage || evt.data.content || '',
                        appName: 'QQ',
                        rawTexts: []
                    });
                }
                break;
            case 'Log':
                log.info('[sidecar.log]', evt.data && evt.data.message);
                break;
            case 'Error':
            case 'AccessDenied':
                sidecarLastError = (evt.data && evt.data.message) || '未知错误';
                log.error('[sidecar.error]', sidecarLastError);
                callbacks.emit('qq:error', evt.data || { message: sidecarLastError });
                break;
            case 'Stopped':
                log.info('[sidecar] 已主动停止');
                break;
        }
    }

    function startSidecar(qqConfig) {
        if (sidecarProcess) {
            log.warn('[sidecar] 已在运行，先停止再启动');
            stopSidecar();
        }
        sidecarShouldRun = true;
        sidecarLastError = null;
        lastSidecarConfig = qqConfig;

        const exePath = getSidecarPath();
        if (!fs.existsSync(exePath)) {
            sidecarLastError = `找不到 sidecar：${exePath}`;
            sidecarConsecutiveCrashes = SIDECAR_MAX_CONSECUTIVE_CRASHES;
            sidecarShouldRun = false;
            log.error(sidecarLastError);
            callbacks.emit('qq:error', { message: sidecarLastError, fatal: true });
            return;
        }

        const configJson = JSON.stringify(buildSidecarConfig(qqConfig));
        const tmpConfigPath = path.join(app.getPath('temp'), `qq-sidecar-config-${Date.now()}.json`);
        sidecarConfigPath = tmpConfigPath;
        try {
            fs.writeFileSync(tmpConfigPath, configJson, 'utf8');
        } catch (e) {
            sidecarLastError = `写入 sidecar 配置文件失败：${e.message}`;
            log.error(sidecarLastError);
            sidecarShouldRun = false;
            return;
        }

        try {
            sidecarProcess = spawn(exePath, ['--config', tmpConfigPath], {
                stdio: ['ignore', 'pipe', 'pipe'],
                windowsHide: true
            });
            sidecarExpectedPid = sidecarProcess.pid;

            // stdout NDJSON 解析（单行上限 1MB）
            let stdoutBuf = '';
            sidecarProcess.stdout.on('data', (chunk) => {
                stdoutBuf += chunk.toString('utf8');
                if (Buffer.byteLength(stdoutBuf, 'utf8') > SIDECAR_STDOUT_MAX_BYTES) {
                    log.warn('[sidecar] stdout 缓冲超过 1MB，丢弃当前内容');
                    stdoutBuf = '';
                    return;
                }
                const lines = stdoutBuf.split(/\r?\n/);
                stdoutBuf = lines.pop() || '';
                for (const line of lines) {
                    if (!line.trim()) continue;
                    handleSidecarLine(line);
                }
            });

            sidecarProcess.stderr.on('data', (chunk) => {
                log.error('[sidecar.stderr]', chunk.toString('utf8'));
            });

            const thisPid = sidecarProcess.pid;
            sidecarProcess.on('exit', (code, signal) => {
                log.info(`[sidecar] 退出 pid=${thisPid} code=${code} signal=${signal} expected=${sidecarExpectedPid}`);

                // ★ 竞态修复：只有 expectedPid 匹配的 exit 事件才会清理引用，
                // 避免 stopSidecar 中旧进程 kill → startSidecar 立刻启新进程后，
                // 最后到达的旧进程 exit 事件误把新进程引用清空。
                if (thisPid !== sidecarExpectedPid) {
                    log.info(`[sidecar] 忽略旧进程 exit 事件，当前 expectedPid=${sidecarExpectedPid}`);
                    return;
                }

                sidecarProcess = null;
                sidecarExpectedPid = null;

                if (sidecarConfigPath) {
                    try { fs.unlinkSync(sidecarConfigPath); } catch (_) {}
                    sidecarConfigPath = null;
                }

                callbacks.emit('qq:status', { running: false, pid: null, lastError: sidecarLastError });

                // 异常退出且 sidecarShouldRun → 指数退避重启
                if (sidecarShouldRun && code !== 0) {
                    sidecarConsecutiveCrashes += 1;
                    if (sidecarConsecutiveCrashes >= SIDECAR_MAX_CONSECUTIVE_CRASHES) {
                        sidecarShouldRun = false;
                        sidecarLastError = `连续崩溃 ${SIDECAR_MAX_CONSECUTIVE_CRASHES} 次，已停止自动重启。请在设置面板检查后手动启动。`;
                        log.error('[sidecar]', sidecarLastError);
                        callbacks.emit('qq:error', { message: sidecarLastError, fatal: true });
                        return;
                    }
                    const delay = getSidecarBackoffMs();
                    log.info(`[sidecar] ${Math.round(delay / 1000)} 秒后自动重启 (第 ${sidecarConsecutiveCrashes} 次连续崩溃)`);
                    if (sidecarRestartTimer) clearTimeout(sidecarRestartTimer);
                    sidecarRestartTimer = setTimeout(() => {
                        if (sidecarShouldRun) startSidecar(lastSidecarConfig);
                    }, delay);
                }
            });

            log.info(`[sidecar] 启动 pid=${sidecarProcess.pid}`);
        } catch (e) {
            sidecarLastError = `启动失败：${e.message}`;
            sidecarConsecutiveCrashes += 1;
            log.error(sidecarLastError);
            sidecarExpectedPid = null;
            sidecarProcess = null;
            callbacks.emit('qq:error', { message: sidecarLastError });
        }
    }

    function stopSidecar() {
        sidecarShouldRun = false;
        sidecarExpectedPid = null;
        if (sidecarRestartTimer) {
            clearTimeout(sidecarRestartTimer);
            sidecarRestartTimer = null;
        }
        const toKill = sidecarProcess;
        const toKillPid = toKill ? toKill.pid : null;
        sidecarProcess = null;
        if (toKillPid) {
            try {
                // taskkill /T /F 杀子进程树，防止 C# sidecar 残留
                execSync(`taskkill /T /F /PID ${toKillPid}`, { stdio: 'ignore', windowsHide: true });
            } catch (e) {
                // 进程可能已经自己退出了，忽略
                log.warn('[sidecar] taskkill 失败:', e.message);
            }
        }
        if (sidecarConfigPath) {
            try { fs.unlinkSync(sidecarConfigPath); } catch (_) {}
            sidecarConfigPath = null;
        }
        callbacks.emit('qq:status', { running: false, pid: null, lastError: sidecarLastError });
    }

    // 配置变更后的重启：单一定时器 + 意图标记，避免快速连续触发时停-起交错/重复启动
    let sidecarConfigRestartTimer = null;
    function restartSidecar() {
        if (sidecarConfigRestartTimer) { clearTimeout(sidecarConfigRestartTimer); sidecarConfigRestartTimer = null; }
        stopSidecar();
        if (!sidecarShouldRun) {
            sidecarShouldRun = true; // 先停后标记重启意图，若期间被手动关闭则定时器内不会重启
        }
        sidecarConfigRestartTimer = setTimeout(() => {
            sidecarConfigRestartTimer = null;
            if (sidecarShouldRun) startSidecar(lastSidecarConfig);
        }, 300);
    }

    return {
        startSidecar,
        stopSidecar,
        restartSidecar,
        getStatus,
        getSidecarPath
    };
}

module.exports = { createSidecarModule };
