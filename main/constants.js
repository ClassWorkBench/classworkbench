// ============================================
// main/constants.js — 主进程共享常量
// 拆分自 main.js，避免各模块硬编码魔法数字/URL
// ============================================

const BG_SOURCES = Object.freeze({
    upx8: { name: 'Upx8 风景', url: 'https://wp.upx8.com/api.php?category=nature&return=302' },
    xxapi: { name: 'XXAPI 4K 壁纸', url: 'https://v2.xxapi.cn/api/random4kPic?type=wallpaper&return=302' }
});

const BG_MAX_CACHE_FILES = 6;        // 背景图缓存上限（原 12，大屏场景 6 张无重复感）
const BG_MAX_BYTES = 20 * 1024 * 1024;   // 单张背景图上限 20MB
const BG_TIMEOUT_MS = 30000;              // 背景图下载超时 30s

const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';  // 开机自启注册表路径

const SIDECAR_MAX_CONSECUTIVE_CRASHES = 8;   // Sidecar 连续崩溃阈值，超过停止自动重启
const SIDECAR_STDOUT_MAX_BYTES = 1024 * 1024; // Sidecar stdout 单行缓冲上限 1MB，防无限缓冲

const STORE_DEFAULTS = Object.freeze({
    settings: null,
    subjects: null,
    homeworks: []
});

const BROWSER_WINDOW_DEFAULTS = Object.freeze({
    width: 1100,
    height: 760,
    minWidth: 360,
    minHeight: 480,
    title: '班级工作台',
    backgroundColor: '#eef2f0'
});

module.exports = {
    BG_SOURCES,
    BG_MAX_CACHE_FILES,
    BG_MAX_BYTES,
    BG_TIMEOUT_MS,
    RUN_KEY,
    SIDECAR_MAX_CONSECUTIVE_CRASHES,
    SIDECAR_STDOUT_MAX_BYTES,
    STORE_DEFAULTS,
    BROWSER_WINDOW_DEFAULTS
};
