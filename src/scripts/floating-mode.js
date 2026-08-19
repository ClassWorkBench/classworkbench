// ============================================
// floating-mode.js — 主窗口浮窗模式
// 更多菜单"浮窗"入口：卡片纯渐出 → 主进程创建画中画浮窗（主窗口自动隐藏）；
// 退出：主窗口自动显示 + 浮窗渐出 + 卡片渐入。
// ============================================

(function () {
    'use strict';

    const state = window.AppState;
    const { toast } = window.AppUtils;
    const api = window.electronAPI;
    const Renderer = window.Renderer;

    const LEAVE_ANIM_MS = 340;   // 卡片渐出时长（与 CSS 0.32s 匹配 + 余量）

    let active = false;
    const floatingIds = new Set();   // 正在浮窗中的卡片
    let bannerEl = null;
    let countEl = null;
    let cleanupFns = [];

    function isActive() { return active; }

    /** 渲染层过滤：浮窗模式中，浮窗中的卡片不在主窗口网格显示 */
    function shouldHideCard(id) {
        return active && floatingIds.has(id);
    }

    function collectCards() {
        const viewDate = state.currentViewDate;
        return state.homeworks
            .filter(hw => hw.date === viewDate)
            .map(hw => {
                const subj = state.subjectList.find(s => s.id === hw.subjectId);
                return {
                    id: hw.id,
                    subjectId: hw.subjectId,
                    subjectName: hw.subjectName || (subj ? subj.name : ''),
                    color: subj ? subj.color : '#5b6abf',
                    content: hw.content,
                    fontSize: state.settings.contentFontSize || 26,
                    // 编号美化设置传给浮窗，保证浮窗与主窗口渲染一致
                    beautifyNumber: state.settings.beautifyNumber !== false
                };
            });
    }

    // ============ 进入 ============
    async function enter() {
        if (active) return;
        const cards = collectCards();
        if (cards.length === 0) { toast('当天没有作业'); return; }
        // 按内容多少排序：多的在前（与主进程布局顺序一致）
        cards.sort((a, b) => (b.content || '').length - (a.content || '').length);

        active = true;
        cards.forEach(c => floatingIds.add(c.id));

        // 1. 主窗口卡片纯渐出（样式保持不变）
        await playLeaveAnimation();

        // 2. 主进程创建浮窗（显示后自动隐藏主窗口）
        try {
            const res = await api.floatEnter(cards);
            if (!res || !res.success) throw new Error((res && res.error) || '浮窗启动失败');
            // 创建失败的卡片：不在浮窗中，从 floatingIds 移除（主进程已让其留在主窗口显示）
            if (res.failed && res.failed.length) {
                res.failed.forEach(id => floatingIds.delete(id));
            }
        } catch (e) {
            active = false;
            floatingIds.clear();
            hideBanner();
            Renderer.renderAll();
            toast('浮窗启动失败：' + (e.message || e));
            return;
        }

        // 3. 清空主窗口卡片 + 显示横幅（主窗口此时已被主进程隐藏）
        updateBanner();
        Renderer.renderAll();
    }

    function playLeaveAnimation() {
        const grid = state.dom.cardsGrid();
        if (!grid) return Promise.resolve();
        const cards = grid.querySelectorAll('.homework-card');
        if (cards.length === 0) return Promise.resolve();
        cards.forEach(card => card.classList.add('float-leaving'));
        return new Promise(resolve => setTimeout(resolve, LEAVE_ANIM_MS));
    }

    // ============ 退出 ============
    async function exit() {
        if (!active) return;
        active = false;
        floatingIds.clear();
        hideBanner();
        // 主进程：立即显示主窗口 + 通知浮窗渐出；此处同步渲染卡片（渐入）
        try { await api.floatExit(); } catch (_) {}
        Renderer.renderAll();
    }

    function toggle() {
        if (active) exit();
        else enter();
    }

    // ============ 主进程事件 ============
    function onCardBack({ id } = {}) {
        if (!active || !id) return;
        floatingIds.delete(id);
        updateBanner();
        Renderer.renderAll();
    }

    function onExited() {
        if (!active) return;
        active = false;
        floatingIds.clear();
        hideBanner();
        Renderer.renderAll();
    }

    // ============ 横幅 ============
    function updateBanner() {
        if (!bannerEl) return;
        if (!active) { bannerEl.style.display = 'none'; return; }
        bannerEl.style.display = '';
        if (countEl) countEl.textContent = floatingIds.size;
    }

    function hideBanner() {
        if (bannerEl) bannerEl.style.display = 'none';
    }

    function init() {
        bannerEl = document.getElementById('floatBanner');
        countEl = document.getElementById('floatCount');
        const exitBtn = document.getElementById('floatExitBtn');
        if (exitBtn) exitBtn.addEventListener('click', exit);

        cleanupFns.push(api.onFloatCardBack(onCardBack));
        cleanupFns.push(api.onFloatExited(onExited));
    }

    window.AppFloatingMode = { init, enter, exit, toggle, isActive, shouldHideCard };
})();
