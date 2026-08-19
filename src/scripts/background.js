// ============================================
// background.js
// 背景图：主进程负责下载和本地缓存，渲染层只负责解码显示
// 支持前台/后台刷新模式
// ============================================

(function () {
    const state = window.AppState;
    const { toast } = window.AppUtils;

    let bgRefreshTimer = null;
    let bgFetching = false;
    let bgLastRefreshTime = 0;
    let bgVisibilityHandler = null;

    function applyBackground(url) {
        const bgLayer = state.dom.bgLayer();
        if (!bgLayer || !url) return Promise.resolve(false);

        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                bgLayer.style.backgroundImage = `url("${url}")`;
                bgLayer.classList.add('loaded');
                resolve(true);
            };
            img.onerror = () => {
                console.warn('[background] 图片解码失败，已跳过:', url);
                resolve(false);
            };
            img.src = url;
        });
    }

    async function fetchNewBackground(showToastOnFail) {
        if (!window.electronAPI || !window.electronAPI.refreshBackground || bgFetching) return;
        bgFetching = true;
        try {
            const result = await window.electronAPI.refreshBackground().catch(() => null);
            if (result && result.ok) {
                const ok = await applyBackground(result.url);
                if (!ok) console.warn('[background] 新背景图不可用:', result.url);
                bgLastRefreshTime = Date.now();
            } else if (showToastOnFail) {
                toast('背景图暂时加载失败，已保留当前背景');
            }
        } finally {
            bgFetching = false;
        }
    }

    async function initBackground() {
        if (!window.electronAPI || !window.electronAPI.getBackground) {
            console.warn('[background] 未检测到 Electron IPC，跳过背景图');
            return;
        }

        const cached = await window.electronAPI.getBackground().catch(() => null);
        if (cached && cached.ok) {
            await applyBackground(cached.url);
        }

        await fetchNewBackground(false);
        bgLastRefreshTime = Date.now();
    }

    function refreshBackground() {
        // 刷新时保留当前图，新图加载成功后再替换，避免断网时闪回米白背景
        fetchNewBackground(true);
    }

    function clearBgRefreshTimer() {
        if (bgRefreshTimer) {
            clearInterval(bgRefreshTimer);
            bgRefreshTimer = null;
        }
    }

    function setupBgRefresh(intervalMinutes) {
        clearBgRefreshTimer();
        if (bgVisibilityHandler) {
            document.removeEventListener('visibilitychange', bgVisibilityHandler);
            bgVisibilityHandler = null;
        }

        if (intervalMinutes <= 0) return;

        const intervalMs = intervalMinutes * 60 * 1000;

        // 定时器
        bgRefreshTimer = setInterval(() => {
            const mode = state.settings.bgRefreshMode || 'always';
            if (mode === 'foreground' && document.hidden) {
                return; // 后台不刷新，等回到前台再处理
            }
            refreshBackground();
        }, intervalMs);

        // 前台感知：从后台回到前台时，若已超时则立即刷新
        bgVisibilityHandler = () => {
            if (document.hidden) return;
            const mode = state.settings.bgRefreshMode || 'always';
            if (mode !== 'foreground') return;

            const elapsed = Date.now() - bgLastRefreshTime;
            if (elapsed >= intervalMs) {
                refreshBackground();
            }
        };
        document.addEventListener('visibilitychange', bgVisibilityHandler);
    }

    function restartBgRefresh() {
        setupBgRefresh(state.settings.bgRefreshInterval);
    }

    window.AppBackground = { initBackground, refreshBackground, setupBgRefresh, restartBgRefresh };
})();
