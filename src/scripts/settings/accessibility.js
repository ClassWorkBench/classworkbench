// ============================================
// settings/accessibility.js — 辅助功能面板
// 作业字号 + 减弱动画 + 模糊效果
// ============================================

window.SettingsModules = window.SettingsModules || {};

window.SettingsModules.accessibility = {
    render(ctx) {
        const { settings } = ctx;
        return `
                    <!-- 面板：辅助功能 -->
                    <div class="settings-panel" id="panel-accessibility">
                        <div class="panel-header">
                            <h3>辅助功能</h3>
                            <p class="panel-desc">字号与动画调节，面向全班投屏的视觉舒适度</p>
                        </div>
                        <div class="panel-body">
                            <div class="setting-group">
                                <label>作业字号</label>
                                <div class="segmented" id="fontSizeSegmented" role="radiogroup" aria-label="作业字号">
                                    <button type="button" class="seg-btn ${settings.contentFontSize <= 23 ? 'active' : ''}" data-size="small" role="radio" aria-checked="${settings.contentFontSize <= 23}">小</button>
                                    <button type="button" class="seg-btn ${settings.contentFontSize >= 24 && settings.contentFontSize <= 29 ? 'active' : ''}" data-size="medium" role="radio" aria-checked="${settings.contentFontSize >= 24 && settings.contentFontSize <= 29}">中</button>
                                    <button type="button" class="seg-btn ${settings.contentFontSize >= 30 ? 'active' : ''}" data-size="large" role="radio" aria-checked="${settings.contentFontSize >= 30}">大</button>
                                </div>
                            </div>
                            <div class="setting-group">
                                <label>动画效果</label>
                                <div class="segmented" id="reduceAnimSegmented" role="radiogroup" aria-label="动画效果">
                                    <button type="button" class="seg-btn ${!settings.reduceAnimation ? 'active' : ''}" data-mode="standard" role="radio" aria-checked="${!settings.reduceAnimation}">标准</button>
                                    <button type="button" class="seg-btn ${settings.reduceAnimation ? 'active' : ''}" data-mode="reduced" role="radio" aria-checked="${settings.reduceAnimation}">减弱</button>
                                </div>
                            </div>
                            <div class="setting-group">
                                <label>模糊效果</label>
                                <div class="toggle-row">
                                    <div class="toggle-row-text">
                                        <span class="toggle-row-title">顶栏 / 底栏 / Toast</span>
                                    </div>
                                    <label class="setting-toggle">
                                        <input type="checkbox" id="blurBarsToggle" ${settings.blurBars ? 'checked' : ''} aria-label="顶栏底栏Toast模糊">
                                        <span class="toggle-slider"></span>
                                    </label>
                                </div>
                                <div class="toggle-row">
                                    <div class="toggle-row-text">
                                        <span class="toggle-row-title">作业卡片</span>
                                    </div>
                                    <label class="setting-toggle">
                                        <input type="checkbox" id="blurCardToggle" ${settings.blurCard ? 'checked' : ''} aria-label="作业卡片模糊">
                                        <span class="toggle-slider"></span>
                                    </label>
                                </div>
                                <div class="toggle-row">
                                    <div class="toggle-row-text">
                                        <span class="toggle-row-title">模态弹窗</span>
                                    </div>
                                    <label class="setting-toggle">
                                        <input type="checkbox" id="blurModalToggle" ${settings.blurModal ? 'checked' : ''} aria-label="模态弹窗模糊">
                                        <span class="toggle-slider"></span>
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
        `;
    },

    bind(ctx) {
        const { state, saveSettings, Renderer, applyStyling } = ctx;
        const settings = state.settings;

        // ---- 作业字号：分段控制器（小 20 / 中 26 / 大 32）----
        const FONT_SIZE_MAP = { small: 20, medium: 26, large: 32 };
        const fontSizeSegmented = document.getElementById('fontSizeSegmented');
        if (fontSizeSegmented) {
            const updateFontSegState = (tier) => {
                fontSizeSegmented.querySelectorAll('.seg-btn').forEach(btn => {
                    const isActive = btn.dataset.size === tier;
                    btn.classList.toggle('active', isActive);
                    btn.setAttribute('aria-checked', isActive ? 'true' : 'false');
                });
            };
            fontSizeSegmented.addEventListener('click', async (e) => {
                const btn = e.target.closest('.seg-btn');
                if (!btn) return;
                const tier = btn.dataset.size;
                const size = FONT_SIZE_MAP[tier];
                if (!size || size === settings.contentFontSize) return;
                settings.contentFontSize = size;
                updateFontSegState(tier);
                await saveSettings();
                applyStyling();
                document.documentElement.style.setProperty('--font-size-content', size + 'px');
                Renderer.renderAll();
            });
        }

        // ---- 减弱动画：标准 / 减弱（iOS 式淡入淡出）----
        const reduceAnimSegmented = document.getElementById('reduceAnimSegmented');
        if (reduceAnimSegmented) {
            reduceAnimSegmented.addEventListener('click', async (e) => {
                const btn = e.target.closest('.seg-btn');
                if (!btn) return;
                const reduced = btn.dataset.mode === 'reduced';
                settings.reduceAnimation = reduced;
                if (window.AppStyling) window.AppStyling.applyReducedMotion();
                reduceAnimSegmented.querySelectorAll('.seg-btn').forEach(b => {
                    const active = (b.dataset.mode === 'reduced') === reduced;
                    b.classList.toggle('active', active);
                    b.setAttribute('aria-checked', active ? 'true' : 'false');
                });
                await saveSettings();
            });
        }

        // ---- 模糊效果：三个开关，切换即时生效 ----
        const blurBarsToggle = document.getElementById('blurBarsToggle');
        const blurCardToggle = document.getElementById('blurCardToggle');
        const blurModalToggle = document.getElementById('blurModalToggle');
        const applyBlurClasses = () => {
            if (window.AppStyling) window.AppStyling.applyBlurClasses();
        };
        const bindBlurToggle = (el, field) => {
            if (!el) return;
            el.addEventListener('change', async () => {
                settings[field] = !!el.checked;
                applyBlurClasses();
                await saveSettings();
            });
        };
        bindBlurToggle(blurBarsToggle, 'blurBars');
        bindBlurToggle(blurCardToggle, 'blurCard');
        bindBlurToggle(blurModalToggle, 'blurModal');
        // 打开设置面板时同步一次（确保 body class 与保存值一致）
        applyBlurClasses();
    }
};