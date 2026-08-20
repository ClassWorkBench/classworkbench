// ============================================
// more-menu.js
// 底部“更多”上拉菜单：复制排版图、设置
// ============================================

(function () {
    'use strict';

    const { toast } = window.AppUtils;
    const sheet = document.getElementById('moreSheet');
    const panel = document.getElementById('moreSheetPanel');
    const toggleBtn = document.getElementById('moreToggle');
    let isOpen = false;

    function positionPanel() {
        if (!panel || !toggleBtn) return;
        const rect = toggleBtn.getBoundingClientRect();
        const capsule = toggleBtn.closest('.bottom-capsule');
        const baseTop = capsule ? capsule.getBoundingClientRect().top : rect.top;
        const panelWidth = panel.offsetWidth || 220;
        const half = Math.min(panelWidth / 2, (window.innerWidth - 16) / 2);
        const minLeft = Math.max(8, half);
        const maxLeft = Math.min(window.innerWidth - 8, window.innerWidth - half);
        const centerX = rect.left + rect.width / 2;
        panel.style.left = Math.min(Math.max(centerX, minLeft), Math.max(minLeft, maxLeft)) + 'px';
        panel.style.top = Math.max(8, baseTop - 14) + 'px';
    }

    function setOpen(open) {
        if (!sheet || !toggleBtn) return;
        // 关闭菜单时，若处于搜索微窗，先还原菜单内容
        if (!open && window.AppSearch && window.AppSearch.isActive()) {
            window.AppSearch.restore();
        }
        isOpen = open;
        if (open) updateFloatBtnLabel();
        sheet.classList.toggle('open', open);
        toggleBtn.classList.toggle('open', open);
        toggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) {
            positionPanel();
            const exportBtn = document.getElementById('exportImageBtn');
            if (exportBtn) exportBtn.focus();
        } else if (!open && sheet.contains(document.activeElement)) {
            toggleBtn.focus();
        }
    }

    // 浮窗模式中，菜单按钮文字切换为"退出浮窗模式"
    function updateFloatBtnLabel() {
        const floatBtn = document.getElementById('floatModeBtn');
        if (!floatBtn) return;
        const label = floatBtn.querySelector('.more-item-label');
        if (!label) return;
        const active = !!(window.AppFloatingMode && window.AppFloatingMode.isActive());
        label.textContent = active ? '退出浮窗模式' : '浮窗';
    }

    function closeMenu() {
        setOpen(false);
    }

    function openMenu() {
        setOpen(true);
    }

    async function copyLayoutImage() {
        closeMenu();
        if (!window.electronAPI || typeof window.electronAPI.copyLayoutImage !== 'function') {
            toast('当前环境不支持复制图片');
            return;
        }

        document.body.classList.add('capturing');
        // 等浮层透明过渡结束后再截图
        await new Promise(resolve => setTimeout(resolve, 260));
        try {
            const result = await window.electronAPI.copyLayoutImage();
            if (result && result.success) {
                toast('已复制排版图片，可直接粘贴');
            } else {
                toast((result && result.error) || '导出失败');
            }
        } catch (e) {
            toast('复制失败：' + (e.message || e));
        } finally {
            document.body.classList.remove('capturing');
        }
    }

    function bindButtons() {
        // 注意：每次调用都会重新 getElementById 获取最新 DOM 并绑定事件。
        // 因为搜索微窗退出时会重建面板内按钮 DOM，需要重新绑定才能恢复交互。
        const exportBtn = document.getElementById('exportImageBtn');
        const floatBtn = document.getElementById('floatModeBtn');
        const settingsBtn = document.getElementById('openSettingsBtn');
        const searchBtn = document.getElementById('searchHomeworkBtn');

        if (exportBtn) exportBtn.addEventListener('click', copyLayoutImage);
        if (floatBtn) {
            floatBtn.addEventListener('click', () => {
                closeMenu();
                if (window.AppFloatingMode && typeof window.AppFloatingMode.toggle === 'function') {
                    window.AppFloatingMode.toggle();
                } else {
                    toast('浮窗模块未加载');
                }
            });
        }
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => {
                closeMenu();
                if (window.AppSettings && typeof window.AppSettings.openSettings === 'function') {
                    window.AppSettings.openSettings();
                }
            });
        }
        if (searchBtn) {
            searchBtn.addEventListener('click', (e) => {
                // 必须阻止冒泡：点击后微窗就地重建 DOM，原按钮被销毁，
                // 若不阻止，document 的"点击外部关闭菜单"会把 e.target(旧按钮) 判为外部而关闭菜单。
                e.stopImmediatePropagation();
                e.preventDefault();
                // 微窗就地变形：不关闭菜单，在面板内切换为搜索界面
                if (window.AppSearch && typeof window.AppSearch.open === 'function') {
                    window.AppSearch.open();
                    requestAnimationFrame(() => positionPanel());
                }
            });
        }
    }

    function init() {
        if (!sheet || !toggleBtn) return;
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            setOpen(!isOpen);
        });
        document.addEventListener('click', (e) => {
            if (!isOpen) return;
            if (!panel.contains(e.target) && !toggleBtn.contains(e.target)) closeMenu();
        });
        window.addEventListener('resize', () => {
            if (isOpen) positionPanel();
        });
        bindButtons();
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && isOpen) closeMenu();
        });
    }

    window.AppMoreMenu = { init, openMenu, closeMenu, bindButtons };
})();
