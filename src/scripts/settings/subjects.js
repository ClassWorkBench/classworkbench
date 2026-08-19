// ============================================
// settings/subjects.js — 学科管理面板
// 添加、删除学科，设置学科颜色
// ============================================

window.SettingsModules = window.SettingsModules || {};

window.SettingsModules.subjects = {
    render(ctx) {
        const { state, escapeHtml } = ctx;
        return `
                    <!-- 面板：学科管理 -->
                    <div class="settings-panel" id="panel-subjects">
                        <div class="panel-header">
                            <h3>学科管理</h3>
                            <p class="panel-desc">添加、删除学科，设置学科颜色</p>
                        </div>
                        <div class="panel-body">
                            <div class="setting-group">
                                <label>已有学科</label>
                                <div id="subjectManageList" class="subject-manage-list"></div>
                            </div>
                            <div class="setting-group">
                                <label>添加新学科</label>
                                <div class="setting-row">
                                    <input id="newSubjName" placeholder="学科名" class="input-flex" aria-label="新学科名称">
                                    <button class="color-swatch-btn" id="newSubjColor" style="background:#5b6abf" aria-label="学科颜色"></button>
                                    <button class="btn primary" id="addSubjBtn" aria-label="添加学科">+ 添加</button>
                                </div>
                            </div>
                        </div>
                    </div>
        `;
    },

    bind(ctx) {
        const { state, saveSubjects, persistHomeworks, toast, Renderer, escapeHtml } = ctx;

        // 初始化自定义颜色选择器
        let selectedColor = '#5b6abf';
        const colorBtn = document.getElementById('newSubjColor');
        if (colorBtn) {
            ColorPicker.init(colorBtn, selectedColor, (color) => {
                selectedColor = color;
                colorBtn.style.background = color;
            });
        }

        const renderSubjManage = () => {
            const listDiv = document.getElementById('subjectManageList');
            if (!listDiv) return;
            listDiv.innerHTML = state.subjectList.map(s => `
                <div class="subject-manage-item">
                    <span class="color-dot" style="background:${s.color};"></span>
                    <span class="name">${escapeHtml(s.name)}</span>
                    <button class="del-btn" data-del="${s.id}" aria-label="删除 ${s.name}">✕</button>
                </div>
            `).join('');
            listDiv.querySelectorAll('.del-btn').forEach(b => {
                b.addEventListener('click', async (e) => {
                    const id = e.target.dataset.del;
                    if (state.subjectList.length <= 1) { toast('至少保留一个学科'); return; }
                    const oldSubjects = [...state.subjectList];
                    const newSubjects = state.subjectList.filter(s => s.id !== id);
                    const newHomeworks = state.homeworks.filter(h => h.subjectId !== id);
                    state.subjectList = newSubjects;  // 先更新内存中的 subjects（persistHomeworks 会一起保存）
                    const ok = await persistHomeworks(newHomeworks);
                    if (ok) {
                        Renderer.renderAll();
                        renderSubjManage();
                        toast('已删除学科');
                    } else {
                        state.subjectList = oldSubjects;  // 回滚 subjects
                        renderSubjManage();
                    }
                });
            });
        };
        renderSubjManage();

        document.getElementById('addSubjBtn').addEventListener('click', async () => {
            const name = document.getElementById('newSubjName').value.trim();
            const color = selectedColor;
            if (!name) { toast('请输入学科名'); return; }
            if (state.subjectList.some(s => s.name === name)) { toast('学科已存在'); return; }
            state.subjectList.push({ id: 'subj_' + Date.now(), name, color });
            await saveSubjects();
            Renderer.renderAll();
            renderSubjManage();
            document.getElementById('newSubjName').value = '';
        });
    }
};
