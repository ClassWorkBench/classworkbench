// ============================================
// window-controls.js
// 自定义无边框窗口控制：仅保留关闭
// ============================================

(function () {
    const controls = window.electronAPI && window.electronAPI.windowControls;
    if (!controls || !controls.close) return;

    const closeBtn = document.getElementById('windowClose');
    if (!closeBtn) return;

    closeBtn.addEventListener('click', () => controls.close());
})();
