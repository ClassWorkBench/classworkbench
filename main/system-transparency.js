// ============================================
// system-transparency.js
// 读取 Windows「透明效果」注册表，轮询变化并向上广播。
// 用途：系统关闭透明 → 渲染层同步关闭软件内的毛玻璃(模糊)效果，保持观感一致。
// 非 Windows / 读取失败 → 返回 null，渲染层不做任何强制，行为等同"系统透明开启"。
// ============================================

const REG_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize';
const POLL_MS = 10_000;

function createSystemTransparencyModule({ execFileSync, log, emit }) {
    let lastEnabled = null; // null=未知/失败；true=透明开；false=透明关
    let timer = null;

    // 读取注册表 EnableTransparency：0x1=开 0x0=关。
    function readTransparencyEnabled() {
        try {
            const out = execFileSync('reg', ['query', REG_KEY, '/v', 'EnableTransparency'], {
                encoding: 'utf8',
                windowsHide: true
            });
            const m = out.match(/EnableTransparency\s+REG_DWORD\s+(0x[0-9a-fA-F]+)/);
            if (!m) return null;
            return parseInt(m[1], 16) === 1;
        } catch (e) {
            log.warn('[system-transparency] 读取注册表失败，按"未知"处理:', e.message || e);
            return null;
        }
    }

    // 仅当状态发生"确定变化"时才广播，避免每轮重复推给渲染层
    function apply() {
        const enabled = readTransparencyEnabled();
        if (enabled !== null && enabled !== lastEnabled) {
            lastEnabled = enabled;
            emit('system:transparency', enabled);
        }
    }

    // 注册表无监听事件，采用低频轮询捕获系统设置变化
    function start() {
        apply();
        clearInterval(timer);
        timer = setInterval(apply, POLL_MS);
        if (timer && timer.unref) timer.unref();
    }

    function stop() {
        clearInterval(timer);
        timer = null;
    }

    function getEnabled() {
        return lastEnabled;
    }

    return { start, stop, apply, getEnabled };
}

module.exports = { createSystemTransparencyModule };