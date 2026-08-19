// ============================================
// settings/nav.js — 设置面板导航切换
// ============================================

window.SettingsModules = window.SettingsModules || {};

window.SettingsModules.nav = function(dialog) {
    const navItems = dialog.querySelectorAll('.settings-nav-item');
    const panels = dialog.querySelectorAll('.settings-panel');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            navItems.forEach(n => n.classList.remove('active'));
            panels.forEach(p => p.classList.remove('active'));
            item.classList.add('active');
            const targetPanel = document.getElementById('panel-' + item.dataset.panel);
            if (targetPanel) targetPanel.classList.add('active');
        });
    });
};
