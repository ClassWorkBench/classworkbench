// ============================================
// settings/personal.js — 个性化面板
// 背景、卡片布局、美化编号、3个模糊开关
// ============================================

window.SettingsModules = window.SettingsModules || {};

window.SettingsModules.personal = {
    render(ctx) {
        const { settings, bgSourceHtml, refreshHtml, colsHtml } = ctx;
        return `
                    <!-- 面板：个性化 -->
                    <div class="settings-panel" id="panel-personal">
                        <div class="panel-header">
                            <h3>个性化</h3>
                            <p class="panel-desc">调整背景来源、刷新策略和卡片布局</p>
                        </div>
                        <div class="panel-body">
                            <div class="setting-group">
                                <label for="bgSourceSelect">背景来源</label>
                                <select id="bgSourceSelect" aria-label="背景来源" class="input-flex-wide" style="min-width:180px;">${bgSourceHtml}</select>
                                <small>图片可能受版权保护</small>
                            </div>
                            <div class="setting-group">
                                <label for="bgRefreshSelect">背景刷新频率</label>
                                <select id="bgRefreshSelect" aria-label="背景刷新频率">${refreshHtml}</select>
                                <small>"不刷新"仅本次会话有效，下次启动仍会加载新图</small>
                            </div>
                            <div class="setting-group">
                                <label for="bgRefreshModeSelect">背景刷新模式</label>
                                <select id="bgRefreshModeSelect" aria-label="背景刷新模式">
                                    <option value="always" ${settings.bgRefreshMode === 'foreground' ? '' : 'selected'}>始终刷新</option>
                                    <option value="foreground" ${settings.bgRefreshMode === 'foreground' ? 'selected' : ''}>仅前台刷新</option>
                                </select>
                                <small>仅前台刷新：窗口在后台时暂停换图，回到前台时若已超时则立即刷新</small>
                            </div>
                            <div class="setting-group">
                                <label>背景图</label>
                                <div class="setting-row">
                                    <button class="btn" id="btnRefreshBg" aria-label="立即换一张背景图">立即换一张</button>
                                </div>
                            </div>
                            <div class="setting-group">
                                <label for="colsSelect">卡片布局</label>
                                <select id="colsSelect" aria-label="选择卡片列数">${colsHtml}</select>
                            </div>
                            <div class="setting-group">
                                <div class="toggle-row">
                                    <div class="toggle-row-text">
                                        <span class="toggle-row-title">美化编号显示</span>
                                        <span class="toggle-row-desc">卡片中将 "1. 2. 3." 显示为圆圈数字徽章</span>
                                    </div>
                                    <label class="setting-toggle">
                                        <input type="checkbox" id="beautifyNumberToggle" ${settings.beautifyNumber === false ? '' : 'checked'} aria-label="卡片中将数字编号显示为圆圈">
                                        <span class="toggle-slider"></span>
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
        `;
    },

    bind(ctx) {
        const { state, saveSettings, toast, Renderer, setupBgRefresh, refreshBackground, restartBgRefresh } = ctx;

        // ---- 背景来源：切换即保存 ----
        const bgSourceSelect = document.getElementById('bgSourceSelect');
        if (bgSourceSelect) {
            bgSourceSelect.addEventListener('change', async () => {
                state.settings.bgSource = bgSourceSelect.value;
                await saveSettings();
                refreshBackground();
            });
        }

        // ---- 背景刷新频率：切换即保存 ----
        const bgRefreshSelect = document.getElementById('bgRefreshSelect');
        bgRefreshSelect.addEventListener('change', async () => {
            const newRefresh = parseInt(bgRefreshSelect.value);
            state.settings.bgRefreshInterval = newRefresh;
            await saveSettings();
            setupBgRefresh(newRefresh);
        });

        // ---- 背景刷新模式：切换即保存 ----
        const bgRefreshModeSelect = document.getElementById('bgRefreshModeSelect');
        bgRefreshModeSelect.addEventListener('change', async () => {
            state.settings.bgRefreshMode = bgRefreshModeSelect.value;
            await saveSettings();
            restartBgRefresh();
        });

        // ---- 立即换一张背景 ----
        const refreshBgBtn = document.getElementById('btnRefreshBg');
        if (refreshBgBtn) refreshBgBtn.addEventListener('click', () => refreshBackground());

        // ---- 卡片列数：切换即保存 ----
        const colsSelect = document.getElementById('colsSelect');
        colsSelect.addEventListener('change', async () => {
            const newCols = parseInt(colsSelect.value);
            state.settings.cardColumns = (newCols === 2 || newCols === 3) ? newCols : 3;
            await saveSettings();
            Renderer.renderAll();
        });

        // ---- 美化编号：开关即保存并重新渲染 ----
        const beautifyToggle = document.getElementById('beautifyNumberToggle');
        if (beautifyToggle) {
            beautifyToggle.addEventListener('change', async () => {
                state.settings.beautifyNumber = !!beautifyToggle.checked;
                await saveSettings();
                Renderer.renderAll();
            });
        }
    }
};
