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
    const exportBtn = document.getElementById('exportImageBtn');
    const floatBtn = document.getElementById('floatModeBtn');
    const settingsBtn = document.getElementById('openSettingsBtn');
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
        isOpen = open;
        if (open) updateFloatBtnLabel();
        sheet.classList.toggle('open', open);
        toggleBtn.classList.toggle('open', open);
        toggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open && exportBtn) {
            positionPanel();
            exportBtn.focus();
        } else if (!open && sheet.contains(document.activeElement)) {
            toggleBtn.focus();
        }
    }

    // 浮窗模式中，菜单按钮文字切换为"退出浮窗模式"
    function updateFloatBtnLabel() {
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
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && isOpen) closeMenu();
        });
    }

    window.AppMoreMenu = { init, openMenu, closeMenu };
})();
