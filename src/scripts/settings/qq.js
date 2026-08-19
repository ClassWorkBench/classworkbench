// ============================================
// settings/qq.js — QQ监听面板
// 监听开关、老师联系人、关键词、高级参数
// ============================================

window.SettingsModules = window.SettingsModules || {};

window.SettingsModules.qq = {
    render(ctx) {
        const { settings, qq, state, escapeHtml } = ctx;
        return `
                    <!-- 面板：QQ监听 -->
                    <div class="settings-panel" id="panel-qq">
                        <div class="panel-header">
                            <h3>QQ监听</h3>
                            <p class="panel-desc">自动捕获 QQ 群消息并抽取作业候选</p>
                        </div>
                        <div class="panel-body">
                            <!-- 区块 1：开关（状态卡片即按钮） -->
                            <div class="setting-group">
                                <label>监听开关</label>
                                <button class="qq-status-btn qq-status-${qq.enabled ? 'on' : 'off'}" id="qqToggle" aria-pressed="${qq.enabled}" aria-label="开关 QQ 通知监听">
                                    <div class="archive-info-icon" id="qqStatusIcon">${qq.enabled ? '<img class="emoji" src="icons/green_circle_flat.svg" alt="运行中">' : '<img class="emoji" src="icons/white_circle_flat.svg" alt="未启动">'}</div>
                                    <div class="archive-info-text">
                                        <div class="archive-info-title" id="qqStatusTitle">${qq.enabled ? '运行中' : '未启动'}</div>
                                        <div class="archive-info-desc" id="qqStatusDesc">${qq.enabled ? '正在监听 QQ 通知' : '开启监听后，系统将自动捕获 QQ 通知消息。'}</div>
                                    </div>
                                </button>
                            </div>

                            <!-- 区块 2：老师联系人 -->
                            <div class="setting-group">
                                <label>老师联系人</label>
                                <div id="qqTeachersList" class="subject-manage-list"></div>
                                <div class="setting-row qq-add-row">
                                    <input id="newTeacherName" placeholder="QQ 昵称（如：张老师）" class="input-flex-wide" aria-label="老师昵称">
                                    <select id="newTeacherSubject" aria-label="老师学科" class="select-min">
                                        <option value="">请选学科</option>
                                        ${state.subjectList.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')}
                                    </select>
                                    <button class="btn primary" id="addTeacherBtn" aria-label="添加老师">+ 添加</button>
                                </div>
                            </div>

                            <!-- 区块 2.5：关键词识别（可折叠） -->
                            <details class="settings-details">
                                <summary>作业关键词</summary>
                                <div class="details-body">
                                    <div class="kw-columns">
                                        <div class="kw-column">
                                            <label class="kw-column-label strong" for="kwStrong">强关键词（+40 分）</label>
                                            <textarea id="kwStrong" aria-label="强关键词，逗号分隔" placeholder="作业, 完成, 上交">${escapeHtml((qq.keywords && qq.keywords.strong || []).join('，'))}</textarea>
                                        </div>
                                        <div class="kw-column">
                                            <label class="kw-column-label weak" for="kwWeak">弱关键词（+30 分）</label>
                                            <textarea id="kwWeak" aria-label="弱关键词，逗号分隔" placeholder="做, 写, 复习">${escapeHtml((qq.keywords && qq.keywords.weak || []).join('，'))}</textarea>
                                        </div>
                                    </div>
                                    <small>用逗号或换行分隔多个关键词</small>
                                </div>
                            </details>

                            <!-- 区块 3：高级参数（可折叠） -->
                            <details class="settings-details">
                                <summary>高级参数</summary>
                                <div class="details-body">
                                    <div class="advanced-param-row" style="margin-bottom:8px;">
                                        <label for="qqScanInterval">扫描间隔（秒）</label>
                                        <input id="qqScanInterval" type="number" step="0.1" min="0.1" max="5" value="${settings.qq.scanIntervalSeconds}" class="input-narrow" aria-label="扫描间隔">
                                    </div>
                                    <div class="advanced-param-row">
                                        <label for="qqCooldown">冷却时长（秒）</label>
                                        <input id="qqCooldown" type="number" min="1" max="60" value="${settings.qq.cooldownSeconds}" class="input-narrow" aria-label="冷却时长">
                                    </div>
                                    <small>修改后需点击下方按钮重启监听进程</small>
                                    <button class="btn btn-mt" id="btnQqApplyRestart" aria-label="应用并重启">应用并重启</button>
                                </div>
                            </details>
                        </div>
                    </div>
        `;
    },

    bind(ctx) {
        const { state, qq, saveSettings, toast, escapeHtml, qqCleanup } = ctx;
        const settings = state.settings;
        const qqApi = window.electronAPI.qq;

        async function updateQqStatusUI() {
            const status = await qqApi.getStatus();
            const icon = document.getElementById('qqStatusIcon');
            const title = document.getElementById('qqStatusTitle');
            const desc = document.getElementById('qqStatusDesc');
            const btn = document.getElementById('qqToggle');
            if (btn) {
                btn.classList.toggle('qq-status-on', !!qq.enabled);
                btn.classList.toggle('qq-status-off', !qq.enabled);
                btn.setAttribute('aria-pressed', String(!!qq.enabled));
            }
            if (qq.enabled) {
                if (icon) icon.innerHTML = '<img class="emoji" src="icons/green_circle_flat.svg" alt="运行中">';
                if (title) title.textContent = '运行中';
                if (desc) desc.textContent = status.running && status.pid
                    ? `PID: ${status.pid}　正在监听 QQ 通知`
                    : '正在监听 QQ 通知';
            } else {
                if (icon) icon.innerHTML = '<img class="emoji" src="icons/white_circle_flat.svg" alt="未启动">';
                if (title) title.textContent = '未启动';
                if (desc) desc.textContent = status.lastError
                    ? `已停止：${status.lastError}`
                    : '开启监听后，系统将自动捕获 QQ 通知消息。';
            }
        }

        // 实时状态推送（先卸上一次的，再挂新的）
        if (qqCleanup.current) {
            try { qqCleanup.current(); } catch (_) {}
            qqCleanup.current = null;
        }
        const offStatus = qqApi.onStatus(() => updateQqStatusUI());
        const offError = qqApi.onError((err) => {
            toast('QQ监听错误');
            updateQqStatusUI();
        });
        qqCleanup.current = () => {
            try { offStatus(); } catch (_) {}
            try { offError(); } catch (_) {}
        };

        // 状态按钮点击切换开关
        document.getElementById('qqToggle').addEventListener('click', async () => {
            const newEnabled = !qq.enabled;
            qq.enabled = newEnabled;
            await saveSettings();
            await qqApi.toggle(newEnabled);
            await updateQqStatusUI();
            toast(newEnabled ? '监听已启动' : '监听已停止');
        });

        // 老师列表渲染（昵称 + 绑定学科下拉，可改学科）
        function renderTeachersList() {
            const listDiv = document.getElementById('qqTeachersList');
            if (!listDiv) return;
            const teachers = qq.teachers || [];
            if (teachers.length === 0) {
                listDiv.innerHTML = '<div class="teacher-list-empty">暂无老师。请在下方输入 QQ 昵称、选择学科后点击「+ 添加」。</div>';
                return;
            }
            const subjOpts = state.subjectList.map(s =>
                `<option value="${s.id}">${escapeHtml(s.name)}</option>`
            ).join('');
            listDiv.innerHTML = teachers.map((t, i) => {
                const sel = t.subjectId
                    ? `<option value="${t.subjectId}" selected>${escapeHtml(t.subjectName || '')}</option>${subjOpts.replace(`value="${t.subjectId}" selected`, `value="${t.subjectId}"`)}`
                    : `<option value="">未绑定</option>${subjOpts}`;
                return `
                    <div class="subject-manage-item">
                        <span class="teacher-name">${escapeHtml(t.name)}</span>
                        <select class="teacher-subject-select" data-teacher-subject="${i}" aria-label="为 ${escapeHtml(t.name)} 选择学科">${sel}</select>
                        <button class="btn danger btn-danger-sm" data-remove-teacher="${i}" aria-label="删除 ${escapeHtml(t.name)}">删除</button>
                    </div>
                `;
            }).join('');
            // 学科变更
            listDiv.querySelectorAll('[data-teacher-subject]').forEach(sel => {
                sel.addEventListener('change', async (e) => {
                    const idx = parseInt(e.target.dataset.teacherSubject);
                    const subjId = e.target.value;
                    const subj = state.subjectList.find(s => s.id === subjId);
                    qq.teachers[idx].subjectId = subjId || null;
                    qq.teachers[idx].subjectName = subj ? subj.name : null;
                    await saveSettings();
                });
            });
            // 删除
            listDiv.querySelectorAll('[data-remove-teacher]').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const idx = parseInt(e.target.dataset.removeTeacher);
                    const removed = qq.teachers[idx];
                    qq.teachers.splice(idx, 1);
                    await saveSettings();
                    renderTeachersList();
                });
            });
        }

        // 手动添加老师（昵称 + 学科）
        document.getElementById('addTeacherBtn').addEventListener('click', async () => {
            const input = document.getElementById('newTeacherName');
            const subjSel = document.getElementById('newTeacherSubject');
            const name = input.value.trim();
            if (!name) { toast('请输入 QQ 昵称'); return; }
            if (qq.teachers.some(t => t.name === name)) { toast('该老师已存在'); return; }
            const subjId = subjSel.value;
            const subj = state.subjectList.find(s => s.id === subjId);
            qq.teachers.push({
                name,
                subjectId: subjId || null,
                subjectName: subj ? subj.name : null
            });
            await saveSettings();
            renderTeachersList();
            input.value = '';
            subjSel.value = '';
        });

        // ---- 关键词编辑：失焦时保存 ----
        function parseKeywords(text) {
            return text.split(/[,，\n]+/).map(k => k.trim()).filter(k => k.length > 0);
        }
        const kwStrongEl = document.getElementById('kwStrong');
        const kwWeakEl = document.getElementById('kwWeak');
        kwStrongEl.addEventListener('change', async () => {
            qq.keywords.strong = parseKeywords(kwStrongEl.value);
            await saveSettings();
        });
        kwWeakEl.addEventListener('change', async () => {
            qq.keywords.weak = parseKeywords(kwWeakEl.value);
            await saveSettings();
        });

        // 应用并重启
        document.getElementById('btnQqApplyRestart').addEventListener('click', async () => {
            const si = parseFloat(document.getElementById('qqScanInterval').value);
            const cd = parseInt(document.getElementById('qqCooldown').value);
            qq.scanIntervalSeconds = isNaN(si) ? 0.5 : Math.max(0.1, Math.min(5, si));
            qq.cooldownSeconds = isNaN(cd) ? 3 : Math.max(1, Math.min(60, cd));
            await saveSettings();
            const status = await qqApi.getStatus();
            if (status.running) {
                await qqApi.updateConfig();
                toast('已重启 sidecar');
            }
        });

        // 初次渲染
        updateQqStatusUI();
        renderTeachersList();
    }
};
