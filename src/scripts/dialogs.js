// ============================================
// dialogs.js
// 业务弹窗：添加、修改作业
// 自动编号：button 形式开关，打开时按钮发光，回车自动续写编号，首次预置 1.
// ============================================

(function () {
    const state = window.AppState;
    const { escapeHtml, toast } = window.AppUtils;
    const { showModal } = window.AppModal;
    const { persistHomeworks, saveSettings } = window.AppStorage;
    const Renderer = window.Renderer;

    // 给 textarea 绑定/解绑自动编号回车逻辑
    function bindAutoNumber(ta, enabledRef) {
        function onKeyDown(e) {
            if (!enabledRef.value) return;
            if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;

            const start = ta.selectionStart;
            const end = ta.selectionEnd;
            if (start !== end) return; // 有选区交给浏览器正常换行

            const before = ta.value.substring(0, start);
            const after = ta.value.substring(end);
            const beforeLines = before.split('\n');
            const currentLine = beforeLines[beforeLines.length - 1] || '';

            const currentHas = /^\s*\d+[.、．]/.test(currentLine);
            const prefixOnlyBlank = currentLine.trim() === '';

            let insertPrefix = null;
            if (currentHas) {
                insertPrefix = nextLineNumber(before);
            } else if (prefixOnlyBlank) {
                const beforeWithoutTail = beforeLines.slice(0, -1).join('\n');
                if (/^\s*\d+[.、．]/m.test(beforeWithoutTail)) {
                    insertPrefix = nextLineNumber(beforeWithoutTail);
                }
            }

            if (insertPrefix == null) return;

            e.preventDefault();
            const insertText = '\n' + insertPrefix + '. ';
            ta.value = before + insertText + after;
            const caret = (before + insertText).length;
            ta.selectionStart = ta.selectionEnd = caret;
            ta.dispatchEvent(new Event('input', { bubbles: true }));
        }
        ta.addEventListener('keydown', onKeyDown);
        return () => ta.removeEventListener('keydown', onKeyDown);
    }

    // 根据最后一行计算下一个编号
    function nextLineNumber(text) {
        const lines = (text || '').split('\n');
        for (let i = lines.length - 1; i >= 0; i--) {
            const m = lines[i].match(/^\s*(\d+)[.、．]/);
            if (m) return parseInt(m[1], 10) + 1;
        }
        return 1;
    }

    function openAddDialog(subject) {
        const enabledRef = { value: state.settings.autoNumber !== false };
        const html = `
            <h3>${emoji('📝')} ${escapeHtml(subject.name)} 作业</h3>
            <textarea id="newContent" placeholder="输入作业内容，每行一条…（开启自动编号时回车自动续写编号）" style="min-height:180px;" aria-label="作业内容"></textarea>
            <div class="dialog-btn-row">
                <button class="btn auto-num-btn ${enabledRef.value ? 'on' : 'off'}" id="autoNumToggle" aria-pressed="${enabledRef.value}" aria-label="自动编号开关">
                    自动编号：${enabledRef.value ? '打开' : '关闭'}
                </button>
                <button class="btn" id="btnCancel" aria-label="取消">取消</button>
                <button class="btn primary" id="btnSave" aria-label="保存作业">保存</button>
            </div>
        `;
        const { close } = showModal(html);
        const ta = document.getElementById('newContent');
        const toggle = document.getElementById('autoNumToggle');

        const unbindAutoNum = bindAutoNumber(ta, enabledRef);

        const refreshToggleUI = () => {
            const on = enabledRef.value;
            toggle.classList.toggle('on', on);
            toggle.classList.toggle('off', !on);
            toggle.textContent = '自动编号：' + (on ? '打开' : '关闭');
            toggle.setAttribute('aria-pressed', String(on));
        };

        toggle.addEventListener('click', async () => {
            enabledRef.value = !enabledRef.value;
            state.settings.autoNumber = enabledRef.value;
            refreshToggleUI();
            try { await saveSettings(); } catch (_) {}
        });

        setTimeout(() => {
            if (enabledRef.value && !ta.value.trim()) {
                ta.value = '1. ';
                requestAnimationFrame(() => {
                    ta.selectionStart = ta.selectionEnd = ta.value.length;
                    ta.focus();
                });
            } else {
                ta.focus();
            }
        }, 120);

        document.getElementById('btnCancel').addEventListener('click', () => {
            unbindAutoNum();
            close();
        });
        document.getElementById('btnSave').addEventListener('click', async () => {
            const content = ta.value.trim();
            if (!content) { toast('内容不能为空'); return; }
            const existing = state.homeworks.find(h => h.subjectId === subject.id && h.date === state.currentViewDate);
            let newHomeworks;
            if (existing) {
                newHomeworks = state.homeworks.map(h =>
                    h.id === existing.id ? { ...h, content: h.content + '\n' + content } : h
                );
            } else {
                newHomeworks = [...state.homeworks, {
                    id: 'hw_' + Date.now(),
                    subjectId: subject.id,
                    subjectName: subject.name,
                    content,
                    date: state.currentViewDate
                }];
            }
            const ok = await persistHomeworks(newHomeworks);
            if (ok) {
                Renderer.renderAll();
                unbindAutoNum();
                close();
            }
        });
    }

    function openModifyDialog(hw) {
        const enabledRef = { value: state.settings.autoNumber !== false };
        const html = `
            <h3>${emoji('✏️')} 修改 ${escapeHtml(hw.subjectName)}</h3>
            <textarea id="modContent" style="min-height:180px;" aria-label="修改作业内容">${escapeHtml(hw.content)}</textarea>
            <div class="dialog-btn-row">
                <button class="btn auto-num-btn ${enabledRef.value ? 'on' : 'off'}" id="autoNumToggle2" aria-pressed="${enabledRef.value}" aria-label="自动编号开关">
                    自动编号：${enabledRef.value ? '打开' : '关闭'}
                </button>
                <button class="btn" id="btnCancel2" aria-label="取消">取消</button>
                <button class="btn primary" id="btnSave2" aria-label="保存修改">保存</button>
            </div>
        `;
        const { close } = showModal(html);
        const ta = document.getElementById('modContent');
        const toggle = document.getElementById('autoNumToggle2');

        const unbindAutoNum = bindAutoNumber(ta, enabledRef);

        const refreshToggleUI = () => {
            const on = enabledRef.value;
            toggle.classList.toggle('on', on);
            toggle.classList.toggle('off', !on);
            toggle.textContent = '自动编号：' + (on ? '打开' : '关闭');
            toggle.setAttribute('aria-pressed', String(on));
        };

        toggle.addEventListener('click', async () => {
            enabledRef.value = !enabledRef.value;
            state.settings.autoNumber = enabledRef.value;
            refreshToggleUI();
            try { await saveSettings(); } catch (_) {}
        });

        setTimeout(() => {
            ta.focus();
            const len = ta.value.length;
            ta.selectionStart = ta.selectionEnd = len;
        }, 120);

        document.getElementById('btnCancel2').addEventListener('click', () => {
            unbindAutoNum();
            close();
        });
        document.getElementById('btnSave2').addEventListener('click', async () => {
            const v = ta.value.trim();
            if (!v) { toast('内容不能为空'); return; }
            const newHomeworks = state.homeworks.map(h =>
                h.id === hw.id ? { ...h, content: v } : h
            );
            const ok = await persistHomeworks(newHomeworks);
            if (ok) {
                Renderer.renderAll();
                unbindAutoNum();
                close();
            }
        });
    }

    window.AppDialogs = { openAddDialog, openModifyDialog };
})();
