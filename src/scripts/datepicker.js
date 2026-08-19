// ============================================
// datepicker.js
// 日期选择器：箭头融入底栏，点击日期按钮展开/收起
// ============================================

(function () {
    const state = window.AppState;
    const Renderer = window.Renderer;

    let arrowsVisible = false;

    function showArrows() {
        const capsule = state.dom.bottomCapsule();
        if (capsule) capsule.classList.add('date-active');
        arrowsVisible = true;
    }

    function hideArrows() {
        const capsule = state.dom.bottomCapsule();
        if (capsule) capsule.classList.remove('date-active');
        arrowsVisible = false;
    }

    function toggle() {
        if (arrowsVisible) hideArrows();
        else showArrows();
    }

    function getCutoffDateStr() {
        const d = new Date();
        d.setMonth(d.getMonth() - 3);
        d.setDate(1);
        return window.AppUtils.localDateStr(d);
    }

    function changeDate(delta) {
        // 浮窗模式中禁止切换日期：浮窗与日期强绑定，先退出浮窗
        if (window.AppFloatingMode && window.AppFloatingMode.isActive()) {
            window.AppUtils.toast('浮窗模式中，请先退出浮窗再切换日期');
            return;
        }
        const newDateStr = window.AppUtils.shiftDateStr(state.currentViewDate, delta);
        const cutoffStr = getCutoffDateStr();

        // 禁止翻到 3 个月前以前
        if (newDateStr < cutoffStr) {
            window.AppUtils.toast('更早的作业已归档，请在设置中查看');
            return;
        }

        state.currentViewDate = newDateStr;
        Renderer.renderAllWithAnimation();
        updateArrowState();
    }

    // 根据当前日期是否到达 3 个月截止线更新上箭头灰态
    function updateArrowState() {
        const prevBtn = state.dom.dpPrev();
        if (!prevBtn) return;
        const cutoffStr = getCutoffDateStr();
        const prevDateStr = window.AppUtils.shiftDateStr(state.currentViewDate, -1);
        prevBtn.classList.toggle('arrow-disabled', prevDateStr < cutoffStr);
    }

    function init() {
        const dateBtn = state.dom.dateBtn();
        const prevBtn = state.dom.dpPrev();
        const nextBtn = state.dom.dpNext();
        const capsule = state.dom.bottomCapsule();

        if (dateBtn) {
            dateBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggle();
            });
        }

        if (prevBtn) {
            prevBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                changeDate(-1);
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                changeDate(1);
            });
        }

        // 点击底栏以外区域收起箭头
        document.addEventListener('click', (e) => {
            if (arrowsVisible && capsule && !capsule.contains(e.target)) {
                hideArrows();
            }
        });

        updateArrowState();
    }

    window.AppDatePicker = { init, showArrows, hideArrows, toggle };
})();
