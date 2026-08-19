// ============================================
// settings/general.js — 常规设置面板
// 晚修时段 + 开机自启
// ============================================

window.SettingsModules = window.SettingsModules || {};

window.SettingsModules.general = {
    render(ctx) {
        const { settings, escapeHtml, eveningStr } = ctx;
        return `
                    <!-- 面板：常规设置 -->
                    <div class="settings-panel active" id="panel-general">
                        <div class="panel-header">
                            <h3>常规设置</h3>
                            <p class="panel-desc">调整晚修时段和开机自启</p>
                        </div>
                        <div class="panel-body">
                            <div class="setting-group">
                                <label for="eveningInput">晚修时段</label>
                                <input id="eveningInput" value="${escapeHtml(eveningStr)}" placeholder="如 19:00-19:50, 20:00-20:50" aria-label="晚修时段">
                                <small class="field-hint">用逗号分隔多个时段，格式 HH:MM-HH:MM</small>
                                <small class="field-error-msg" id="eveningError" style="display:none;"></small>
                            </div>
                            <div class="setting-group">
                                <div class="toggle-row">
                                    <div class="toggle-row-text">
                                        <span class="toggle-row-title">开机自启</span>
                                        <span class="toggle-row-desc">登录 Windows 时自动启动班级工作台</span>
                                    </div>
                                    <label class="setting-toggle">
                                        <input type="checkbox" id="autoLaunchToggle" aria-label="开机自动启动班级工作台">
                                        <span class="toggle-slider"></span>
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
        `;
    },

    bind(ctx) {
        const { state, saveSettings, toast, Renderer, api } = ctx;

        // ---- 晚修时段：实时校验 + 失焦时保存 ----
        const eveningInput = document.getElementById('eveningInput');
        const eveningError = document.getElementById('eveningError');
        const timeRe = /^([01]?\d|2[0-3]):([0-5]\d)$/;

        function normalizeTime(t) {
            const m = t.match(/^(\d{1,2}):(\d{2})$/);
            if (!m) return t;
            return m[1].padStart(2, '0') + ':' + m[2];
        }

        function validateEvening(value) {
            const eveStr = value.trim().replace(/，/g, ',').replace(/：/g, ':').replace(/－/g, '-');
            if (!eveStr) return '不能为空';
            const parts = eveStr.split(',').map(p => p.trim()).filter(Boolean);
            if (parts.length === 0) return '至少需要一个时段';
            for (const p of parts) {
                const [s, e] = p.split('-').map(x => x.trim());
                if (!s || !e) return `格式错误："${p}" 应为 HH:MM-HH:MM`;
                if (!timeRe.test(s)) return `开始时间无效："${s}"`;
                if (!timeRe.test(e)) return `结束时间无效："${e}"`;
            }
            return null;
        }

        eveningInput.addEventListener('input', () => {
            const err = validateEvening(eveningInput.value);
            if (err) {
                eveningInput.classList.add('input-error');
                eveningError.textContent = err;
                eveningError.style.display = 'block';
            } else {
                eveningInput.classList.remove('input-error');
                eveningError.style.display = 'none';
            }
        });

        eveningInput.addEventListener('change', async () => {
            const err = validateEvening(eveningInput.value);
            if (err) {
                toast('格式有误，请修正后保存');
                eveningInput.focus();
                return;
            }
            const normalized = eveningInput.value.trim().replace(/，/g, ',').replace(/：/g, ':').replace(/－/g, '-');
            const sections = normalized.split(',').map(p => {
                const [s, e] = p.split('-').map(x => x.trim());
                return { start: normalizeTime(s), end: normalizeTime(e) };
            });
            state.settings.eveningSections = sections;
            await saveSettings();
            Renderer.renderAll();
        });

        // ---- 开机自启：读取系统登录项状态，切换时写入 Windows 登录项 ----
        const autoLaunchToggle = document.getElementById('autoLaunchToggle');
        (async () => {
            try {
                const res = await api.getAutoLaunch();
                if (res && res.success) autoLaunchToggle.checked = !!res.enabled;
            } catch (e) {
                console.error('读取开机自启状态失败:', e);
            }
        })();
        autoLaunchToggle.addEventListener('change', async () => {
            const enabled = autoLaunchToggle.checked;
            const res = await api.setAutoLaunch(enabled);
            if (!res || res.success === false) {
                autoLaunchToggle.checked = !enabled;
                toast('开机自启设置失败');
                return;
            }
        });
    }
};
