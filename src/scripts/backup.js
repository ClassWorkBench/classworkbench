// ============================================
// backup.js — 备份与恢复（渲染层业务）
// 设置按导航面板分组勾选备份；作业按日期范围或全部备份；
// 恢复默认"覆盖 + 恢复前自动快照"，可选手动合并。
// 文件读写（保存/打开对话框）由主进程 backup.js 提供。
// ============================================

(function () {
    const state = window.AppState;
    const { escapeHtml, toast, localDateStr } = window.AppUtils;
    const { showModal } = window.AppModal;
    const { saveSettings } = window.AppStorage;
    const { applyStyling } = window.AppStyling;
    const { restartWeatherRefresh } = window.AppWeather;
    const { restartBgRefresh } = window.AppBackground;
    const Renderer = window.Renderer;
    const api = window.electronAPI;

    const BACKUP_VERSION = 1;

    // 设置导航面板 → 设置字段映射（备份/恢复粒度 = 面板）
    // subjects 是独立数组（不在 settings 对象内），用 special 标记
    const SETTINGS_SECTIONS = [
        { id: 'general', name: '常规设置', keys: ['eveningSections'] },
        {
            id: 'weather', name: '天气',
            keys: ['weatherProvider', 'openmeteoCities', 'qweatherCities', 'qweatherApiHost', 'qweatherApiKey',
                'qweatherKid', 'qweatherSub', 'qweatherPrivateKey',
                'alertEnabledLevels', 'weatherRefreshInterval', 'weatherRefreshMode']
        },
        {
            id: 'personal', name: '个性化',
            keys: ['bgSource', 'bgRefreshInterval', 'bgRefreshMode', 'cardColumns', 'autoNumber', 'beautifyNumber']
        },
        {
            id: 'accessibility', name: '辅助功能',
            keys: ['contentFontSize', 'reduceAnimation', 'blurBars', 'blurCard', 'blurModal']
        },
        { id: 'qq', name: 'QQ监听', keys: ['qq'] },
        { id: 'subjects', name: '学科管理', special: 'subjects' }
    ];

    const DEFAULT_STRONG = ['作业', '完成', '上交', '提交', '订正', '背诵', '默写'];
    const DEFAULT_WEAK = ['做', '写', '复习', '预习', '练习', '答案'];

    function fileStamp() {
        const d = new Date();
        const p = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
    }

    function deepClone(v) {
        return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
    }

    /** YYYY-MM-DD 字符串范围判断（字典序即时间序） */
    function inRange(dateStr, from, to) {
        const d = String(dateStr || '');
        if (!d) return false;
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
    }

    // ============================================
    // 入口：备份与恢复管理弹窗
    // ============================================
    function openBackupRestore() {
        const html = `
            <div class="backup-dialog">
                <h3>备份与恢复</h3>
                <p class="backup-desc">设置与作业分开备份；恢复前会自动备份当前数据</p>
                <div class="backup-action-list">
                    <button class="backup-action-btn" id="btnBackupSettings" type="button">
                        <span class="backup-action-title">备份设置</span>
                        <span class="backup-action-sub">按模块勾选，导出 JSON 文件</span>
                    </button>
                    <button class="backup-action-btn" id="btnBackupHomework" type="button">
                        <span class="backup-action-title">备份作业</span>
                        <span class="backup-action-sub">按日期范围或全部，可选包含归档</span>
                    </button>
                    <button class="backup-action-btn" id="btnRestoreBackup" type="button">
                        <span class="backup-action-title">恢复备份</span>
                        <span class="backup-action-sub">从 JSON 文件导入，覆盖或合并</span>
                    </button>
                </div>
                <div class="confirm-btn-row">
                    <button class="btn" id="btnCloseBackup" type="button">关闭</button>
                </div>
            </div>
        `;
        const { dialog, close } = showModal(html, null, { replace: false });
        dialog.querySelector('#btnCloseBackup').addEventListener('click', close);
        dialog.querySelector('#btnBackupSettings').addEventListener('click', openBackupSettingsDialog);
        dialog.querySelector('#btnBackupHomework').addEventListener('click', openBackupHomeworkDialog);
        dialog.querySelector('#btnRestoreBackup').addEventListener('click', openRestoreDialog);
    }

    // ============================================
    // 备份设置：勾选模块 → 导出
    // ============================================
    function openBackupSettingsDialog() {
        const html = `
            <div class="backup-dialog">
                <h3>备份设置</h3>
                <p class="backup-desc">勾选要备份的模块，导出为 JSON 文件（不含作业内容）</p>
                <div class="backup-section-list">
                    ${SETTINGS_SECTIONS.map(s => `
                        <label class="backup-section-item">
                            <input type="checkbox" class="backup-section-cb" data-section="${s.id}" checked>
                            <span class="backup-section-name">${s.name}</span>
                        </label>
                    `).join('')}
                </div>
                <p class="backup-note">备份文件包含和风天气 API Key 等敏感信息，请妥善保管。</p>
                <div class="confirm-btn-row">
                    <button class="btn" id="btnCancelBackupSettings" type="button">取消</button>
                    <button class="btn primary" id="btnConfirmBackupSettings" type="button">导出备份</button>
                </div>
            </div>
        `;
        const { dialog, close } = showModal(html, null, { replace: false });
        dialog.querySelector('#btnCancelBackupSettings').addEventListener('click', close);
        dialog.querySelector('#btnConfirmBackupSettings').addEventListener('click', async () => {
            const selected = Array.from(dialog.querySelectorAll('.backup-section-cb:checked'))
                .map(cb => cb.dataset.section);
            if (selected.length === 0) { toast('请至少勾选一个模块'); return; }
            const payload = buildSettingsBackup(selected);
            const res = await api.exportBackup(`班级工作台-设置备份-${fileStamp()}.json`, payload);
            if (!res) return;
            if (res.canceled) { close(); return; }
            if (!res.success) { toast('备份失败：' + (res.error || '未知错误')); return; }
            toast('设置备份已导出');
            close();
        });
    }

    function buildSettingsBackup(selectedIds) {
        const settingsSubset = {};
        const sections = [];
        for (const sec of SETTINGS_SECTIONS) {
            if (!selectedIds.includes(sec.id)) continue;
            sections.push(sec.id);
            if (sec.special === 'subjects') continue;
            for (const key of sec.keys) {
                if (key in state.settings) settingsSubset[key] = deepClone(state.settings[key]);
            }
        }
        const data = { settings: settingsSubset };
        if (selectedIds.includes('subjects')) data.subjects = deepClone(state.subjectList);
        return {
            app: 'classworkbench',
            version: BACKUP_VERSION,
            kind: 'settings',
            sections,
            createdAt: new Date().toISOString(),
            data
        };
    }

    // ============================================
    // 备份作业：按日期 / 全部 / 仅归档（分段控制器互斥），可选包含归档
    // ============================================
    function openBackupHomeworkDialog() {
        const today = localDateStr();
        let archivesData = null;
        const html = `
            <div class="backup-dialog">
                <h3>备份作业</h3>
                <p class="backup-desc">导出作业数据，备份自动附带对应学科分类</p>
                <div class="segmented backup-mode-segmented" id="bkModeSeg" role="radiogroup" aria-label="备份范围">
                    <button type="button" class="seg-btn active" data-mode="range" role="radio" aria-checked="true">按日期导出</button>
                    <button type="button" class="seg-btn" data-mode="all" role="radio" aria-checked="false">全部作业</button>
                    <button type="button" class="seg-btn" data-mode="archives" role="radio" aria-checked="false">仅归档</button>
                </div>
                <div class="backup-range-row" id="bkRangeRow">
                    <label class="backup-range-label">从</label>
                    <input type="date" id="bkFrom" value="${today}" class="input-flex" aria-label="开始日期">
                    <label class="backup-range-label">到</label>
                    <input type="date" id="bkTo" value="${today}" class="input-flex" aria-label="结束日期">
                </div>
                <div class="toggle-row" id="bkArchRow">
                    <div class="toggle-row-text">
                        <span class="toggle-row-title">包含已归档作业</span>
                        <span class="toggle-row-desc">同时导出超过 3 个月的归档作业</span>
                    </div>
                    <label class="setting-toggle">
                        <input type="checkbox" id="bkIncludeArchives" checked aria-label="包含已归档作业">
                        <span class="toggle-slider"></span>
                    </label>
                </div>
                <p class="backup-count-note" id="bkCountNote">正在统计…</p>
                <div class="confirm-btn-row">
                    <button class="btn" id="btnCancelBackupHw" type="button">取消</button>
                    <button class="btn primary" id="btnConfirmBackupHw" type="button">导出备份</button>
                </div>
            </div>
        `;
        const { dialog, close } = showModal(html, null, { replace: false });
        const segBtns = dialog.querySelectorAll('#bkModeSeg .seg-btn');
        const rangeRow = dialog.querySelector('#bkRangeRow');
        const archRow = dialog.querySelector('#bkArchRow');
        const fromEl = dialog.querySelector('#bkFrom');
        const toEl = dialog.querySelector('#bkTo');
        const incArchEl = dialog.querySelector('#bkIncludeArchives');
        const archDesc = dialog.querySelector('#bkArchRow .toggle-row-desc');
        const noteEl = dialog.querySelector('#bkCountNote');
        let currentMode = 'range';

        (async () => {
            try { archivesData = await api.getArchives(); } catch (_) { archivesData = null; }
            updateCount();
        })();

        function rangeCount() {
            const from = fromEl.value;
            const to = toEl.value;
            let active = 0;
            let archCount = 0;
            let archMonths = 0;
            if (currentMode === 'archives') {
                if (archivesData) {
                    for (const [month, items] of Object.entries(archivesData)) {
                        const arr = Array.isArray(items) ? items : [];
                        if (arr.length) { archMonths++; archCount += arr.length; }
                    }
                }
            } else {
                for (const hw of state.homeworks) {
                    if (currentMode === 'all' || inRange(hw.date, from, to)) active++;
                }
                if (incArchEl.checked && archivesData) {
                    for (const [month, items] of Object.entries(archivesData)) {
                        const arr = Array.isArray(items) ? items : [];
                        const n = currentMode === 'all' ? arr.length : arr.filter(h => inRange(h.date, from, to)).length;
                        if (n) archMonths++;
                        archCount += n;
                    }
                }
            }
            return { active, archCount, archMonths };
        }

        function updateCount() {
            const { active, archCount, archMonths } = rangeCount();
            if (currentMode === 'archives') {
                noteEl.textContent = archCount ? `将导出归档作业 ${archMonths} 个月 ${archCount} 条` : '当前没有归档作业';
                return;
            }
            let txt = currentMode === 'all' ? `将导出全部 ${active} 条作业` : `将导出 ${active} 条作业`;
            if (incArchEl.checked && archCount) txt += `，另有归档 ${archMonths} 个月 ${archCount} 条`;
            noteEl.textContent = txt;
        }

        function setMode(mode) {
            currentMode = mode;
            segBtns.forEach(b => {
                const on = b.dataset.mode === mode;
                b.classList.toggle('active', on);
                b.setAttribute('aria-checked', on ? 'true' : 'false');
            });
            const isRange = mode === 'range';
            fromEl.disabled = !isRange;
            toEl.disabled = !isRange;
            rangeRow.classList.toggle('disabled', !isRange);  // 置灰日期框：直观告知日期失效
            archRow.style.display = mode === 'archives' ? 'none' : '';  // 仅归档时"包含归档"无意义，隐藏
            if (archDesc) {
                archDesc.textContent = mode === 'all'
                    ? '同时导出全部归档作业'
                    : '按所选日期范围导出已归档作业';
            }
            updateCount();
        }

        segBtns.forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
        fromEl.addEventListener('change', updateCount);
        toEl.addEventListener('change', updateCount);
        incArchEl.addEventListener('change', updateCount);
        setMode('range');

        dialog.querySelector('#btnCancelBackupHw').addEventListener('click', close);
        dialog.querySelector('#btnConfirmBackupHw').addEventListener('click', async () => {
            const { active, archCount } = rangeCount();
            if (currentMode !== 'archives' && !active && !archCount) { toast('所选范围没有作业'); return; }
            if (currentMode === 'archives' && !archCount) { toast('当前没有归档作业'); return; }
            const payload = buildHomeworkBackup({
                mode: currentMode,
                from: fromEl.value,
                to: toEl.value,
                includeArchives: incArchEl.checked,
                archivesData
            });
            const res = await api.exportBackup(`班级工作台-作业备份-${fileStamp()}.json`, payload);
            if (!res) return;
            if (res.canceled) { close(); return; }
            if (!res.success) { toast('备份失败：' + (res.error || '未知错误')); return; }
            toast('作业备份已导出');
            close();
        });
    }

    function buildHomeworkBackup({ mode, from, to, includeArchives, archivesData }) {
        const data = {
            referenceSubjects: deepClone(state.subjectList)  // 学科快照：恢复时保证作业配色一致
        };
        const sections = [];

        if (mode === 'archives') {
            // 仅归档：只导出归档作业，不包含活跃作业（避免恢复覆盖时清空当前作业）
            const archives = {};
            if (archivesData) {
                for (const [month, items] of Object.entries(archivesData)) {
                    const arr = Array.isArray(items) ? items : [];
                    if (arr.length) archives[month] = deepClone(arr);
                }
            }
            if (Object.keys(archives).length) {
                data.archives = archives;
                sections.push('archives');
            }
        } else {
            data.homeworks = mode === 'all'
                ? deepClone(state.homeworks)
                : deepClone(state.homeworks.filter(hw => inRange(hw.date, from, to)));
            sections.push('homeworks');
            if (includeArchives && archivesData) {
                const archives = {};
                for (const [month, items] of Object.entries(archivesData)) {
                    const arr = Array.isArray(items) ? items : [];
                    const inMonth = mode === 'all' ? arr : arr.filter(h => inRange(h.date, from, to));
                    if (inMonth.length) archives[month] = deepClone(inMonth);
                }
                if (Object.keys(archives).length) {
                    data.archives = archives;
                    sections.push('archives');
                }
            }
        }

        return {
            app: 'classworkbench',
            version: BACKUP_VERSION,
            kind: 'homeworks',
            sections,
            createdAt: new Date().toISOString(),
            data
        };
    }

    // ============================================
    // 恢复备份：导入 → 确认（覆盖/合并）→ 快照 → 应用
    // ============================================
    async function openRestoreDialog() {
        const res = await api.importBackup();
        if (!res) return;
        if (res.canceled) return;
        if (!res.success) { toast('导入失败：' + (res.error || '未知错误')); return; }
        const backup = res.data;
        const err = validateBackup(backup);
        if (err) { toast(err); return; }
        showRestoreConfirm(backup);
    }

    function validateBackup(b) {
        if (!b || typeof b !== 'object') return '备份文件格式无效';
        if (b.version !== BACKUP_VERSION) return '不支持的备份文件版本';
        const d = b.data;
        if (!d || typeof d !== 'object') return '备份文件缺少数据';
        if (d.settings !== undefined && (typeof d.settings !== 'object' || d.settings === null)) return '备份中的设置数据无效';
        if (d.subjects !== undefined && !Array.isArray(d.subjects)) return '备份中的学科数据无效';
        if (d.homeworks !== undefined && !Array.isArray(d.homeworks)) return '备份中的作业数据无效';
        if (d.archives !== undefined && (typeof d.archives !== 'object' || d.archives === null || Array.isArray(d.archives))) return '备份中的归档数据无效';
        if (d.settings === undefined && d.homeworks === undefined && d.archives === undefined) return '备份中没有可恢复的内容';
        return null;
    }

    function buildSummaryParts(backup) {
        const d = backup.data;
        const parts = [];
        if (d.settings && Object.keys(d.settings).length) {
            const names = (backup.sections || []).map(id => {
                const sec = SETTINGS_SECTIONS.find(s => s.id === id);
                return sec && sec.special !== 'subjects' ? sec.name : null;
            }).filter(Boolean);
            const label = names.length ? names.join('、') : `${Object.keys(d.settings).length} 项`;
            parts.push(`设置（${label}）`);
        }
        if (d.subjects) parts.push(`学科列表（${d.subjects.length} 个）`);
        if (d.homeworks) parts.push(`作业（${d.homeworks.length} 条）`);
        if (d.archives) {
            const months = Object.keys(d.archives);
            const count = months.reduce((n, m) => n + (Array.isArray(d.archives[m]) ? d.archives[m].length : 0), 0);
            parts.push(`归档（${months.length} 个月 ${count} 条）`);
        }
        return parts;
    }

    function missingSubjectCount(homeworks, subjectList) {
        const ids = new Set(subjectList.map(s => s.id));
        return homeworks.filter(h => h && !ids.has(h.subjectId)).length;
    }

    function showRestoreConfirm(backup) {
        const d = backup.data;
        const hasHomework = Array.isArray(d.homeworks) && d.homeworks.length > 0;
        const refSubjects = Array.isArray(d.referenceSubjects) ? d.referenceSubjects : (Array.isArray(d.subjects) ? d.subjects : null);
        const parts = buildSummaryParts(backup);

        const html = `
            <div class="backup-dialog">
                <h3>恢复备份</h3>
                <p class="backup-desc">此备份包含：</p>
                <div class="backup-summary">${parts.map(p => `<div>• ${escapeHtml(p)}</div>`).join('')}</div>
                <p class="backup-desc">恢复方式：</p>
                <label class="backup-radio">
                    <input type="radio" name="restoreMode" value="overwrite" checked>
                    <span class="backup-radio-title">覆盖（推荐）</span>
                    <span class="backup-radio-desc">备份内容替换当前对应数据；恢复前自动备份当前数据到本机</span>
                </label>
                <label class="backup-radio">
                    <input type="radio" name="restoreMode" value="merge">
                    <span class="backup-radio-title">合并</span>
                    <span class="backup-radio-desc">作业/学科按 ID 合并，备份优先，当前独有的保留；设置按模块覆盖</span>
                </label>
                ${hasHomework && refSubjects ? `
                    <div class="toggle-row">
                        <div class="toggle-row-text">
                            <span class="toggle-row-title">同时恢复学科列表</span>
                            <span class="toggle-row-desc" id="restoreSubjectsDesc">保证恢复的作业配色一致</span>
                        </div>
                        <label class="setting-toggle">
                            <input type="checkbox" id="restoreSubjects" checked aria-label="同时恢复学科列表">
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                    <p class="backup-note" id="restoreMissingNote" style="display:none;"></p>
                ` : ''}
                <div class="confirm-btn-row">
                    <button class="btn" id="btnCancelRestore" type="button">取消</button>
                    <button class="btn primary" id="btnConfirmRestore" type="button">确认恢复</button>
                </div>
            </div>
        `;
        const { dialog, close } = showModal(html, null, { replace: false });

        const subjectsCb = dialog.querySelector('#restoreSubjects');
        if (hasHomework && refSubjects && subjectsCb) {
            const updateMissingNote = () => {
                const target = subjectsCb.checked ? refSubjects : state.subjectList;
                const missing = missingSubjectCount(d.homeworks, target);
                const note = dialog.querySelector('#restoreMissingNote');
                if (missing > 0) {
                    note.style.display = '';
                    note.textContent = `有 ${missing} 条作业的学科不在${subjectsCb.checked ? '备份的学科列表' : '当前学科列表'}中，建议勾选"同时恢复学科列表"。`;
                } else {
                    note.style.display = 'none';
                }
            };
            subjectsCb.addEventListener('change', updateMissingNote);
            updateMissingNote();
        }

        dialog.querySelector('#btnCancelRestore').addEventListener('click', close);
        dialog.querySelector('#btnConfirmRestore').addEventListener('click', async () => {
            const mode = dialog.querySelector('input[name="restoreMode"]:checked').value;
            const restoreSubjects = !subjectsCb || subjectsCb.checked;
            const result = await doRestore(backup, mode, restoreSubjects);
            if (result && result.ok) {
                toast('恢复完成' + (result.snapshotOk ? '，当前数据已自动备份到本机' : ''));
                close();
            }
        });
    }

    async function doRestore(backup, mode, restoreSubjects) {
        // 1. 恢复前自动快照当前数据（覆盖/合并都会先快照，均可反悔）
        let snapshotOk = false;
        try {
            const snap = await api.createRestoreSnapshot({
                homeworks: state.homeworks,
                subjects: state.subjectList,
                settings: state.settings
            });
            snapshotOk = !!(snap && snap.success);
        } catch (_) { /* 快照失败不阻断恢复，仅提示 */ }

        const d = backup.data;

        // 2. 设置：按备份包含的模块逐 key 覆盖（两种模式一致，粒度已在备份时选定）
        if (d.settings) applySettings(d.settings);

        // 3. 学科：设置备份中显式勾选的学科，或作业备份附带且用户勾选恢复的学科快照
        const explicitSubjects = Array.isArray(d.subjects);
        const refSubjects = Array.isArray(d.referenceSubjects);
        if (explicitSubjects || (refSubjects && restoreSubjects)) {
            applySubjects(explicitSubjects ? d.subjects : d.referenceSubjects, mode);
        }

        // 4. 作业
        if (Array.isArray(d.homeworks)) applyHomeworks(d.homeworks, mode);

        // 5. 归档写回（按月份文件合并，id 去重）
        if (d.archives) {
            try { await api.restoreArchives(d.archives); } catch (_) { /* 归档写回失败不阻断主流程 */ }
        }

        // 6. 持久化（settings/subjects/homeworks 一起保存）
        const ok = await saveSettings();
        if (!ok) {
            toast('保存失败，已恢复原数据');
            try { await window.AppStorage.loadAll(); } catch (_) {}
            return { ok: false };
        }

        // 7. 刷新运行时状态
        applyRuntimeAfterRestore();
        return { ok: true, snapshotOk };
    }

    function applySettings(subset) {
        for (const [key, value] of Object.entries(subset)) {
            state.settings[key] = deepClone(value);
        }
        // qq 结构兜底，避免恢复的旧数据缺字段导致渲染崩溃
        const qq = state.settings.qq;
        if (!qq || typeof qq !== 'object') state.settings.qq = {};
        const q = state.settings.qq;
        if (q.enabled === undefined) q.enabled = false;
        if (!Array.isArray(q.teachers)) q.teachers = [];
        if (!Array.isArray(q.pendingCandidates)) q.pendingCandidates = [];
        if (!q.keywords || typeof q.keywords !== 'object') q.keywords = {};
        if (!Array.isArray(q.keywords.strong)) q.keywords.strong = DEFAULT_STRONG;
        if (!Array.isArray(q.keywords.weak)) q.keywords.weak = DEFAULT_WEAK;
    }

    function applySubjects(subjects, mode) {
        const list = deepClone(subjects);
        list.forEach(s => { if (!s || !s.color) s.color = '#5b6abf'; });
        if (mode === 'merge') {
            const byId = new Map(state.subjectList.map(s => [s.id, s]));
            for (const s of list) byId.set(s.id, s);
            state.subjectList = [...byId.values()];
        } else {
            state.subjectList = list;
        }
        if (state.subjectList.length === 0) state.subjectList = deepClone(window.AppConfig.DEFAULT_SUBJECTS);
    }

    function applyHomeworks(homeworks, mode) {
        const list = deepClone(homeworks);
        if (mode === 'merge') {
            const byId = new Map(state.homeworks.map(h => [h.id, h]));
            for (const hw of list) byId.set(hw.id, hw);
            state.homeworks = [...byId.values()];
        } else {
            state.homeworks = list;
        }
    }

    function applyRuntimeAfterRestore() {
        try { applyStyling(); } catch (_) {}
        document.body.classList.toggle('blur-bars-off', state.settings.blurBars === false);
        document.body.classList.toggle('blur-card-off', state.settings.blurCard === false);
        document.body.classList.toggle('blur-modal-off', state.settings.blurModal === false);
        document.body.classList.toggle('reduce-anim', !!state.settings.reduceAnimation);
        try { restartWeatherRefresh(); } catch (_) {}
        try { restartBgRefresh(); } catch (_) {}
        try { Renderer.renderAll(); } catch (_) {}
        syncQqAfterRestore();
    }

    /** 恢复后让 QQ sidecar 状态与恢复的设置保持一致 */
    async function syncQqAfterRestore() {
        try {
            const status = await api.qq.getStatus();
            const enabled = !!state.settings.qq?.enabled;
            if (enabled && !status.running) await api.qq.toggle(true);
            else if (!enabled && status.running) await api.qq.toggle(false);
            else if (enabled && status.running) await api.qq.updateConfig();
        } catch (_) { /* 侧车状态同步失败不阻断 */ }
    }

    window.AppBackup = { openBackupRestore };
})();
