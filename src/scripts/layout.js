// ============================================
// layout.js
// 顶栏高度自适应：让 body padding-top 跟随顶栏高度
// ============================================

(function () {
    function adjustContentPadding() {
        const topCapsule = document.getElementById('topCapsule');
        if (!topCapsule) return;
        const rect = topCapsule.getBoundingClientRect();
        const h = rect.height;
        const topGap = parseInt(getComputedStyle(topCapsule).top) || 10;
        const targetPT = h + topGap + 12;
        document.body.style.paddingTop = targetPT + 'px';
        const toastContainerEl = document.getElementById('toastContainer');
        if (toastContainerEl) {
            toastContainerEl.style.top = (targetPT + 4) + 'px';
        }
    }

    window.AppLayout = { adjustContentPadding };
})();
