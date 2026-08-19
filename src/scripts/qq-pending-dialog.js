// ============================================
// qq-pending-dialog.js
// 待确认作业：学科胶囊红点 + 候选处理面板
//
// 交互模型：
//   1. 候选只负责勾选和编辑
//   2. 底部操作栏统一处理：保存/合并/忽略/关闭
//   3. 关闭不删除候选
//   4. 合并使用独立确认弹窗
// ============================================

(function () {
    const state = window.AppState;
    const { escapeHtml, toast } = window.AppUtils;
    const { showModal } = window.AppModal;
    const { saveSettings, persistHomeworks } = window.AppStorage;
    const Engine = window.HomeworkEngine;
    const Renderer = window.Renderer;
    const api = window.electronAPI;

    // 采纳面板实时追加钩子：弹窗打开期间收到新候选时，追加到面板
    let _openDialogSubjectId = null;
    let _openDialogAppendFn = null;

    // 3 个月前的截止日期（防止日期胶囊翻到归档）
    function getCutoffDate() {
        const d = new Date();
        d.setMonth(d.getMonth() - 3);
        d.setDate(1);
        d.setHours(0, 0, 0, 0);
        return d;
    }

    // 候选去重 key：sender + rawMessage 的简单哈希
    function dedupKey(c) {
        return `${c.sender || ''}|${c.rawMessage || c.content || ''}`;
    }

    // 接收 QQ 通知 → 引擎抽取 → 入队
    async function handleNotification(notification) {
        if (!notification) return;

        const candidate = Engine.extract(notification);
        if (!candidate) return;

        const qq = state.settings.qq;
        const key = dedupKey(candidate);
        const existingKeys = new Set((qq.pendingCandidates || []).map(dedupKey));
        if (existingKeys.has(key)) {
            console.log('[QQPending] 候选重复，跳过:', key.substring(0, 40));
            return;
        }

        qq.pendingCandidates.push(candidate);
        if (qq.pendingCandidates.length > 30) qq.pendingCandidates.shift();

        try {
            await saveSettings();
        } catch (e) {
            // saveSettings 已自行 toast 报错
        }

        toast(`收到作业候选：${candidate.subjectName}`);
        updatePendingBadge();
        if (typeof Renderer !== 'undefined') Renderer.renderBottomPills();

        if (_openDialogSubjectId === candidate.subjectId && typeof _openDialogAppendFn === 'function') {
            _openDialogAppendFn(candidate);
        }
    }

    // 徽标：内联显示在学科胶囊文字前面
    function updatePillBadges() {
        const qq = state.settings.qq;
        const candidates = qq.pendingCandidates || [];
        const subjectPillsDiv = state.dom.subjectPills();
        if (!subjectPillsDiv) return;

        const counts = {};
        candidates.forEach(c => {
            if (c.subjectId) counts[c.subjectId] = (counts[c.subjectId] || 0) + 1;
        });

        subjectPillsDiv.querySelectorAll('.subject-pill').forEach(btn => {
            const subjId = btn.dataset.subjectId;
            const count = counts[subjId] || 0;
            let badge = btn.querySelector('.pill-badge-inline');
            const textSpan = btn.querySelector('.pill-text');

            if (count > 0) {
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'pill-badge-inline';
                    if (textSpan && textSpan.parentNode === btn) {
                        btn.insertBefore(badge, textSpan);
                    } else {
                        btn.appendChild(badge);
                    }
                }
                badge.textContent = count > 9 ? '9+' : String(count);
                badge.style.display = 'inline-flex';
            } else {
                if (badge) badge.remove();
            }
        });
    }

    function updatePendingBadge() {
        updatePillBadges();
    }

    // 采纳面板内的日期胶囊（‹ [📅 MM月DD日] ›）
    function buildInlineDateCapsule(initialDateStr, opts) {
        const host = document.createElement('div');
        host.className = 'inline-date-capsule';
        host.innerHTML = `
            <button class="idc-arrow idc-prev" aria-label="前一天">‹</button>
            <button class="idc-date-btn" aria-label="选择日期"></button>
            <button class="idc-arrow idc-next" aria-label="后一天">›</button>
        `;

        let currentDate = window.AppUtils.parseLocalDate(initialDateStr);
        let arrowsVisible = false;
        const cutoff = getCutoffDate();
        const prevBtn = host.querySelector('.idc-prev');
        const nextBtn = host.querySelector('.idc-next');
        const dateBtn = host.querySelector('.idc-date-btn');

        function formatDate(d) {
            return `${d.getMonth() + 1}月${d.getDate()}日`;
        }
        function dateToStr(d) {
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }
        function render() {
            dateBtn.innerHTML = emoji('📅') + ` <span>${escapeHtml(formatDate(currentDate))}</span>`;
            if (opts && opts.onChange) opts.onChange(dateToStr(currentDate));
        }
        function showArrows() {
            if (arrowsVisible) return;
            arrowsVisible = true;
            host.classList.add('date-active');
        }
        function hideArrows() {
            if (!arrowsVisible) return;
            arrowsVisible = false;
            host.classList.remove('date-active');
        }
        function toggleArrows() {
            if (arrowsVisible) hideArrows(); else showArrows();
        }
        function changeDate(delta) {
            const nd = new Date(currentDate);
            nd.setDate(nd.getDate() + delta);
            nd.setHours(0, 0, 0, 0);
            if (nd < cutoff) {
                toast('更早的日期已归档');
                return;
            }
            currentDate = nd;
            render();
        }

        dateBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleArrows();
        });
        prevBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            changeDate(-1);
        });
        nextBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            changeDate(1);
        });

        function onDocClick(e) {
            if (arrowsVisible && !host.contains(e.target)) hideArrows();
        }
        document.addEventListener('click', onDocClick);

        render();
        return {
            el: host,
            getDateStr: () => dateToStr(currentDate),
            setDate: (s) => {
                currentDate = window.AppUtils.parseLocalDate(s);
                render();
            },
            dispose: () => document.removeEventListener('click', onDocClick)
        };
    }

    // 处理学科胶囊点击：有候选打开处理面板，无候选走普通添加
    function handlePillClick(subject, openAddDialog) {
        const qq = state.settings.qq;
        const candidates = qq.pendingCandidates.filter(c => c.subjectId === subject.id);

        if (candidates.length === 0) {
            openAddDialog();
            return;
        }

        openAdoptDialog(subject, candidates);
    }

    function openAdoptDialog(subject, initialCandidates) {
        const initialDate = state.currentViewDate;

        const html = `
            <div class="adopt-root">
                <h3 id="adoptHeading"></h3>
                <div class="adopt-top-bar">
                    <div class="adopt-subject-badge">
                        <span class="dot" style="background:${subject.color || '#5b6abf'};"></span>
                        <span class="name">${escapeHtml(subject.name)}</span>
                    </div>
                    <div id="adoptDateHost"></div>
                </div>

                <div class="adopt-scroll">
                    <div id="existingHost"></div>
                    <div id="adoptPanels" class="adopt-list"></div>
                    <p class="adopt-hint">勾选候选后使用下方按钮处理；合并需要至少 2 条；关闭面板不会删除候选。</p>
                </div>

                <div class="adopt-actions">
                    <button type="button" class="btn" id="btnClose">关闭</button>
                    <button type="button" class="btn danger" id="btnIgnore">忽略选中</button>
                    <button type="button" class="btn" id="btnMerge">合并选中</button>
                    <button type="button" class="btn primary" id="btnSave">保存选中</button>
                </div>
            </div>
        `;

        const { close, dialog } = showModal(html, () => {
            cleanupResources();
        });
        if (dialog) dialog.classList.add('adopt-dialog');

        const dateHost = document.getElementById('adoptDateHost');
        const panelsDiv = document.getElementById('adoptPanels');
        const existingHost = document.getElementById('existingHost');
        const headingEl = document.getElementById('adoptHeading');
        const btnClose = document.getElementById('btnClose');
        const btnIgnore = document.getElementById('btnIgnore');
        const btnMerge = document.getElementById('btnMerge');
        const btnSave = document.getElementById('btnSave');

        let existingHomework = null;
        let existingRow = null;
        let dateCapsule = null;
        let cleanedUp = false;

        function disposeExistingRow() {
            if (existingRow && existingRow._autoResizeDispose) {
                try { existingRow._autoResizeDispose(); } catch (_) {}
                existingRow._autoResizeDispose = null;
            }
            existingRow = null;
        }

        function renderExistingRow(targetDate) {
            disposeExistingRow();
            existingHomework = state.homeworks.find(h =>
                h.date === targetDate && h.subjectId === subject.id
            ) || null;
            existingHost.innerHTML = '';
            if (!existingHomework) return;

            const meta = `${existingHomework.date} · ${(existingHomework.content || '').length} 字`;
            existingHost.innerHTML = `
                <div class="adopt-panel adopt-existing">
                    <div class="adopt-panel-head">
                        <div class="sender-line">${emoji('📌')} 已有作业 <span class="existing-meta">${escapeHtml(meta)}</span></div>
                    </div>
                    <textarea class="adopt-ta" id="existingTa" aria-label="已有作业内容"></textarea>
                    <label class="adopt-existing-toggle">
                        <input type="checkbox" class="include-existing-cb" checked>
                        保存/合并时包含已有作业
                    </label>
                </div>
            `;
            existingRow = existingHost.firstElementChild;
            const ta = existingRow.querySelector('#existingTa');
            ta.value = existingHomework.content || '';
            existingRow._autoResizeDispose = autoResize(ta);
        }

        function getPanels() {
            return Array.from(panelsDiv.querySelectorAll('.adopt-panel:not(.leaving)'));
        }

        function getCheckedPanels() {
            return getPanels().filter(p => {
                const cb = p.querySelector('.adopt-cb');
                return cb && cb.checked;
            });
        }

        function getIncludeExisting() {
            const cb = existingRow && existingRow.querySelector('.include-existing-cb');
            return !!(cb && cb.checked);
        }

        function getExistingContent() {
            if (!existingRow) return existingHomework ? (existingHomework.content || '') : '';
            const ta = existingRow.querySelector('#existingTa');
            return ta ? ta.value.trim() : '';
        }

        function removePendingByKeys(keys) {
            const keySet = new Set(keys);
            state.settings.qq.pendingCandidates = (state.settings.qq.pendingCandidates || []).filter(
                c => !keySet.has(dedupKey(c))
            );
        }

        function updateHeading() {
            const count = getPanels().length;
            headingEl.textContent = `${subject.name}：${count} 条候选`;
        }

        function updateButtons() {
            const count = getCheckedPanels().length;
            btnSave.disabled = count === 0;
            btnSave.textContent = count > 0 ? `保存选中 (${count})` : '保存选中';
            btnIgnore.disabled = count === 0;
            btnIgnore.textContent = count > 0 ? `忽略选中 (${count})` : '忽略选中';
            btnMerge.disabled = count < 2;
            btnMerge.textContent = count >= 2 ? `合并选中 (${count})` : '合并选中';
            updateHeading();
        }

        // textarea 高度自适应（保留原生手动调整）
        function autoResize(textarea) {
            if (!textarea) return;
            const resize = () => {
                textarea.style.height = 'auto';
                const scrollH = textarea.scrollHeight;
                textarea.style.height = Math.max(scrollH - 2, 24) + 'px';
            };
            requestAnimationFrame(resize);
            textarea.addEventListener('input', resize);
            window.addEventListener('resize', resize);
            textarea._autoResize = resize;
            return () => window.removeEventListener('resize', resize);
        }

        function createPanel(candidate) {
            const key = dedupKey(candidate);
            const panel = document.createElement('div');
            panel.className = 'adopt-panel';
            panel.dataset.key = key;
            panel.innerHTML = `
                <div class="adopt-panel-head">
                    <input type="checkbox" class="adopt-cb" checked aria-label="选中此条">
                    <div class="sender-line">来自 <strong>${escapeHtml(candidate.sender)}</strong></div>
                </div>
                <textarea class="adopt-ta" aria-label="编辑候选内容"></textarea>
            `;
            const ta = panel.querySelector('.adopt-ta');
            ta.value = candidate.content || '';
            panel._autoResizeDispose = autoResize(ta);
            return panel;
        }

        function appendPanel(candidate, withAnimation, delay = 0) {
            const panel = createPanel(candidate);
            panel.classList.add('is-new');
            setTimeout(() => panel.classList.remove('is-new'), 2400);
            panelsDiv.appendChild(panel);
            if (withAnimation) {
                panel.style.opacity = '0';
                panel.style.transform = 'translateY(12px) scale(0.97)';
                requestAnimationFrame(() => {
                    panel.style.transition = `
                        opacity 0.4s var(--transition-smooth) ${delay}s,
                        transform 0.5s var(--transition-spring) ${delay}s
                    `;
                    panel.style.opacity = '1';
                    panel.style.transform = 'translateY(0) scale(1)';
                    setTimeout(() => { panel.style.transition = ''; }, 550 + delay * 1000);
                });
            }
            updateButtons();
        }

        function removePanelAnimated(panel) {
            if (panel.dataset.removing === '1') return Promise.resolve();
            panel.dataset.removing = '1';
            panel.classList.add('leaving', 'collapse');
            const h = panel.offsetHeight;
            panel.style.overflow = 'hidden';
            panel.style.height = h + 'px';
            requestAnimationFrame(() => {
                panel.style.height = '0';
                panel.style.marginBottom = '0';
                panel.style.paddingTop = '0';
                panel.style.paddingBottom = '0';
            });
            return new Promise(resolve => {
                let settled = false;
                const finish = () => {
                    if (settled) return;
                    settled = true;
                    panel.removeEventListener('transitionend', onEnd);
                    if (panel._autoResizeDispose) {
                        try { panel._autoResizeDispose(); } catch (_) {}
                        panel._autoResizeDispose = null;
                    }
                    panel.remove();
                    resolve();
                };
                const onEnd = (e) => {
                    if (e && e.propertyName && e.propertyName !== 'height') return;
                    finish();
                };
                panel.addEventListener('transitionend', onEnd);
                setTimeout(finish, 400);
            });
        }

        function checkAllDone() {
            if (getPanels().length === 0) {
                closeWithCleanup();
                return true;
            }
            return false;
        }

        async function saveSelected() {
            const panels = getCheckedPanels();
            if (panels.length === 0) return;

            const targetDate = dateCapsule.getDateStr();
            const targetSubject = state.subjectList.find(s => s.id === subject.id);
            if (!targetSubject) {
                toast('学科不存在');
                return;
            }

            const contents = [];
            for (const panel of panels) {
                const ta = panel.querySelector('.adopt-ta');
                const content = ta ? ta.value.trim() : '';
                if (!content) {
                    toast('有候选内容为空，请填写或取消勾选');
                    return;
                }
                contents.push(content);
            }

            const includeExisting = getIncludeExisting();
            let newHomeworks;
            if (includeExisting && existingHomework) {
                const base = getExistingContent();
                newHomeworks = state.homeworks.map(h =>
                    h === existingHomework
                        ? { ...h, content: [base, ...contents].filter(Boolean).join('\n') }
                        : h
                );
            } else {
                newHomeworks = [...state.homeworks];
                for (const content of contents) {
                    newHomeworks.push({
                        id: 'hw_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                        subjectId: targetSubject.id,
                        subjectName: targetSubject.name,
                        content,
                        date: targetDate
                    });
                }
            }

            const ok = await persistHomeworks(newHomeworks);
            if (!ok) return;

            removePendingByKeys(panels.map(p => p.dataset.key));
            await saveSettings();
            await Promise.all(panels.map(removePanelAnimated));
            updatePendingBadge();
            Renderer.renderAll();
            renderExistingRow(targetDate);
            updateButtons();
            toast(`已保存 ${contents.length} 条`);
            checkAllDone();
        }

        async function ignoreSelected() {
            const panels = getCheckedPanels();
            if (panels.length === 0) return;

            removePendingByKeys(panels.map(p => p.dataset.key));
            await saveSettings();
            await Promise.all(panels.map(removePanelAnimated));
            updatePendingBadge();
            Renderer.renderBottomPills();
            updateButtons();
            toast(`已忽略 ${panels.length} 条`);
            checkAllDone();
        }

        function mergeSelected() {
            const panels = getCheckedPanels();
            if (panels.length < 2) return;

            const targetDate = dateCapsule.getDateStr();
            const targetSubject = state.subjectList.find(s => s.id === subject.id);
            if (!targetSubject) {
                toast('学科不存在');
                return;
            }

            const contents = [];
            for (const panel of panels) {
                const ta = panel.querySelector('.adopt-ta');
                const content = ta ? ta.value.trim() : '';
                if (!content) {
                    toast('有候选内容为空，请填写或取消勾选');
                    return;
                }
                contents.push(content);
            }

            const includeExisting = getIncludeExisting();
            const existingContent = includeExisting ? getExistingContent() : '';
            const mergedText = [existingContent, ...contents].filter(Boolean).join('\n');
            if (!mergedText) {
                toast('没有可保存的内容');
                return;
            }

            const mergeHtml = `
                <div class="adopt-merge-modal">
                    <h3>合并编辑</h3>
                    <p class="adopt-merge-note">${includeExisting ? '结果将替换当天已有作业' : '结果将保存为一条新作业'}</p>
                    <textarea id="mergeTa" aria-label="合并后的作业内容"></textarea>
                    <div class="adopt-actions">
                        <button type="button" class="btn" id="btnCancelMerge">取消</button>
                        <button type="button" class="btn primary" id="btnConfirmMerge">确认保存</button>
                    </div>
                </div>
            `;
            const { close: closeMerge } = showModal(mergeHtml, null, { replace: false });
            const mergeTa = document.getElementById('mergeTa');
            mergeTa.value = mergedText;

            document.getElementById('btnCancelMerge').addEventListener('click', closeMerge);
            document.getElementById('btnConfirmMerge').addEventListener('click', async () => {
                const content = mergeTa.value.trim();
                if (!content) {
                    toast('内容不能为空');
                    return;
                }

                let newHomeworks;
                if (includeExisting && existingHomework) {
                    newHomeworks = state.homeworks.map(h =>
                        h === existingHomework ? { ...h, content } : h
                    );
                } else {
                    newHomeworks = [...state.homeworks, {
                        id: 'hw_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                        subjectId: targetSubject.id,
                        subjectName: targetSubject.name,
                        content,
                        date: targetDate
                    }];
                }

                const ok = await persistHomeworks(newHomeworks);
                if (!ok) return;

                removePendingByKeys(panels.map(p => p.dataset.key));
                await saveSettings();
                updatePendingBadge();
                Renderer.renderAll();
                closeMerge();
                closeWithCleanup();
                toast(`已保存合并内容（${targetDate}）`);
            });
        }

        function cleanupResources() {
            if (cleanedUp) return;
            cleanedUp = true;
            panelsDiv.querySelectorAll('.adopt-panel').forEach(panel => {
                if (panel._autoResizeDispose) {
                    try { panel._autoResizeDispose(); } catch (_) {}
                    panel._autoResizeDispose = null;
                }
            });
            disposeExistingRow();
            _openDialogSubjectId = null;
            _openDialogAppendFn = null;
            if (dateCapsule) dateCapsule.dispose();
        }

        function closeWithCleanup() {
            cleanupResources();
            close();
        }

        // 日期变化时同步“已有作业”区域
        dateCapsule = buildInlineDateCapsule(initialDate, {
            onChange: (newDate) => {
                renderExistingRow(newDate);
                updateButtons();
            }
        });
        dateHost.appendChild(dateCapsule.el);

        // 实时追加钩子
        _openDialogSubjectId = subject.id;
        _openDialogAppendFn = (candidate) => {
            appendPanel(candidate, true);
        };

        // 候选勾选状态变化时刷新按钮
        panelsDiv.addEventListener('change', (e) => {
            if (e.target.classList.contains('adopt-cb')) updateButtons();
        });

        btnClose.addEventListener('click', closeWithCleanup);
        btnSave.addEventListener('click', saveSelected);
        btnIgnore.addEventListener('click', ignoreSelected);
        btnMerge.addEventListener('click', mergeSelected);

        renderExistingRow(initialDate);
        initialCandidates.forEach((c, i) => appendPanel(c, true, i * 0.06));
        updateButtons();
    }

    function init() {
        if (!api || !api.qq) return;
        api.qq.onNotification(handleNotification);

        const qq = state.settings.qq;
        if (qq && qq.enabled && qq.teachers && qq.teachers.length > 0) {
            api.qq.toggle(true).then(() => {
                toast('QQ监听已自动启动');
            }).catch(e => {
                toast('QQ监听启动失败');
            });
        } else if (qq && qq.enabled) {
            console.log('[QQPending] 已启用但老师列表为空，跳过自动启动');
        }
        updatePendingBadge();
    }

    window.QQPending = {
        init,
        openPendingDialog: () => {},
        updatePendingBadge,
        handleNotification,
        handlePillClick
    };
})();
