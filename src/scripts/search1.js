// ============================================
// search1.js  （备份版：进入仍是「从天而降」，返回已做「变形回缩」优化）
// 保留自 search.js 中「只优化了返回动画」那一轮的完整状态。
//   - 点击「作业搜索」后，更多菜单面板变形为搜索微窗
//   - 搜索框固定在微窗最底部，打开时从天而降（进入动画 = 原版）
//   - 点击返回 → 丝滑「宽度收窄 + 高度回缩 + 淡入」还原菜单（本轮优化点）
//   - 未输入结果时微窗较小，出现结果后丝滑撑大
//   - 筛选条件默认折叠
//   - 结果「越上面越不匹配」（按相关度升序排）
//   - 点击结果 → 跳转到该作业日期并关闭菜单
// ============================================

(function () {
    'use strict';

    const state = window.AppState;
    const { escapeHtml } = window.AppUtils;

    const panel = document.getElementById('moreSheetPanel');
    const savedMenuHtml = panel ? panel.innerHTML : '';

    let microActive = false;   // 是否处于搜索微窗状态
    let archiveCache = null;
    let selectedSubjectIds = new Set();
    let currentKw = '';        // 当前关键词（小写）
    let currentTerms = [];     // 当前关键词按空白拆分后的词项
    let debounceTimer = null;
    let filtersResizeTimer = null;

    // DOM 引用
    let root = null;     // .sm-root
    let listEl = null;   // .sm-list
    let elKw = null;     // 搜索框
    let elFilters = null;
    let elSummary = null;
    let elFrom = null;   // 开始日期
    let elTo = null;     // 结束日期
    let elArchive = null; // 归档勾选

    const MAX_LIST = 300;      // 结果区最大高度 px
    const SPRING = 'var(--transition-spring)';

    // ---- 工具 ----
    function todayISO() {
        const d = new Date();
        const p = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    }

    async function getArchiveHomeworks() {
        if (archiveCache) return archiveCache;
        if (!window.electronAPI || typeof window.electronAPI.archiveGetMonths !== 'function') return [];
        const months = await window.electronAPI.archiveGetMonths().catch(() => []);
        const arr = [];
        for (const m of months) {
            const data = await window.electronAPI.archiveLoadMonth(m).catch(() => []);
            if (Array.isArray(data)) arr.push(...data);
        }
        archiveCache = arr;
        return arr;
    }

    // ---- 相关度评分（用于「越上越不匹配」排序）----
    // 查询词按空白拆成多个词项，多词时采用「命中词数越多越相关」的 OR 匹配，
    // 避免整段短语子串匹配导致搜不到 / 搜不准。
    function parseTerms(kw) {
        return (kw || '').trim().split(/\s+/).filter(Boolean);
    }

    // 返回该词项在作业上的命中情况：'content' | 'subject' | null
    function termHit(hw, term) {
        if ((hw.content || '').toLowerCase().includes(term)) return 'content';
        if ((hw.subjectName || '').toLowerCase().includes(term)) return 'subject';
        return null;
    }

    function computeScore(hw) {
        if (!currentTerms.length) return 0;
        const c = (hw.content || '').toLowerCase();
        const sn = (hw.subjectName || '').toLowerCase();
        let s = 0;
        let hitTerms = 0;
        for (const t of currentTerms) {
            let count = 0, first = -1, i = 0;
            while ((i = c.indexOf(t, i)) >= 0) { count++; if (first < 0) first = i; i += t.length; }
            if (count > 0) {
                s += count * 3;                                    // 内容命中次数
                s += Math.max(0, 8 - first / 50);                  // 命中位置靠前
                hitTerms++;
            }
            if (sn.includes(t)) { s += 6; hitTerms++; }            // 学科名命中（较低权重，避免整科霸榜）
        }
        s += hitTerms * 8;                                         // 命中词项越多越相关
        if (hw.date) {                                             // 日期新近度
            const days = (Date.now() - new Date(hw.date).getTime()) / 86400000;
            s += Math.max(0, 5 - days / 30);
        }
        return s;
    }

    function collectBase(includeArchive) {
        let base = state.homeworks;
        if (includeArchive) base = base.concat(archiveCache || []);
        return base;
    }

    function filterByCriteria(hw, from, to) {
        if (currentTerms.length && !currentTerms.some(t => termHit(hw, t))) return false;
        if (selectedSubjectIds.size > 0 && !selectedSubjectIds.has(hw.subjectId)) return false;
        if (from && hw.date < from) return false;
        if (to && hw.date > to) return false;
        return true;
    }

    function buildList() {
        const from = (elFrom && elFrom.value) || '';
        const to = (elTo && elTo.value) || '';
        const incArchive = elArchive ? elArchive.checked : false;

        const base = collectBase(incArchive);
        let matched = base.filter(h => filterByCriteria(h, from, to));

        // 排序：有关键词按相关度升序（越上越不匹配）；无关键词按日期降序
        if (currentKw) matched.sort((a, b) => computeScore(a) - computeScore(b));
        else matched.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

        listEl.innerHTML = '';
        if (elSummary) elSummary.textContent = matched.length ? `${matched.length} 条匹配` : '';

        if (matched.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'sm-empty';
            empty.textContent = incArchive ? '未找到匹配的作业' : '没有匹配的作业（可展开筛选看归档）';
            listEl.appendChild(empty);
        } else {
            const frag = document.createDocumentFragment();
            for (const hw of matched) {
                const subj = (state.subjectList || []).find(s => s.id === hw.subjectId);
                const color = subj ? subj.color : '#5b6abf';
                const item = document.createElement('button');
                item.type = 'button';
                item.className = 'sm-result';
                item.innerHTML =
                    `<span class="sm-dot" style="background:${color}"></span>` +
                    `<span class="sm-main">` +
                    `<span class="sm-top"><span class="sm-subject" style="color:${color}">${escapeHtml(hw.subjectName || '未命名学科')}</span>` +
                    `<span class="sm-date">${escapeHtml(hw.date || '')}</span></span>` +
                    `<span class="sm-content">${highlight(hw.content || '', currentKw)}</span>` +
                    `</span>`;
                item.addEventListener('click', () => goToDate(hw.date));
                frag.appendChild(item);
            }
            listEl.appendChild(frag);
        }
    }

    function goToDate(date) {
        if (date) state.currentViewDate = date;
        restore();
        if (window.AppMoreMenu && window.AppMoreMenu.closeMenu) window.AppMoreMenu.closeMenu();
        if (window.Renderer) window.Renderer.renderAllWithAnimation();
    }

    function highlight(content, kw) {
        const esc = escapeHtml(content);
        const MAX = 120;
        if (!kw) return esc.length > MAX ? esc.slice(0, MAX) + '…' : esc;
        const lower = esc.toLowerCase();
        const first = lower.indexOf(kw);
        if (first < 0) return esc.length > MAX ? esc.slice(0, MAX) + '…' : esc;
        const start = Math.max(0, first - 30);
        const end = Math.min(esc.length, start + MAX);
        const clip = lower.slice(start, end);
        let frag = '', s = 0, it = clip.indexOf(kw, s);
        while (it >= 0) {
            frag += escapeHtml(esc.slice(start + s, start + it)) +
                '<mark>' + escapeHtml(esc.slice(start + it, start + it + kw.length)) + '</mark>';
            s = it + kw.length;
            it = clip.indexOf(kw, s);
        }
        frag += escapeHtml(esc.slice(start + s, end));
        return (start > 0 ? '…' : '') + frag + (end < esc.length ? '…' : '');
    }

    function scheduleDebounce() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(applySearch, 320);
    }

    function applySearch() {
        currentKw = (elKw && elKw.value ? elKw.value.trim().toLowerCase() : '');
        currentTerms = parseTerms(currentKw);
        buildList();
        syncSize();
    }

    // ---- 尺寸动画：无结果时小，有结果时丝滑撑大 ----
    function syncSize() {
        if (!microActive || !root || !listEl || !panel) return;
        panel.style.overflow = 'hidden';

        const savedH = listEl.style.height;
        listEl.style.height = '0px';
        const base = root.offsetHeight;         // 不含结果区的高度
        listEl.style.height = savedH || 'auto';

        const content = listEl.scrollHeight;
        const lh = content > 0 ? Math.min(content, MAX_LIST) : 0;
        listEl.style.height = lh + 'px';

        const maxH = Math.max(120, Math.floor(window.innerHeight * 0.55));
        panel.style.height = Math.min(base + lh, maxH) + 'px';
    }

    function renderSubjectPills() {
        if (!elFilters) return;
        // 清空胶囊容器（保留日期/归档区，胶囊单独放）
        const wrap = elFilters.querySelector('.sm-caps');
        if (!wrap) return;
        wrap.innerHTML = '';
        const subjects = state.subjectList || [];
        const mk = (id, label, color, selected) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'sm-subj' + (selected ? ' active' : '');
            if (color) b.style.setProperty('--subj-accent', color);
            b.textContent = label;
            b.addEventListener('click', () => { toggleSubject(id); });
            return b;
        };
        wrap.appendChild(mk('__all__', '全部', null, subjects.length > 0 && selectedSubjectIds.size === 0));
        for (const s of subjects) wrap.appendChild(mk(s.id, s.name, s.color, selectedSubjectIds.has(s.id)));
    }

    function toggleSubject(id) {
        if (id === '__all__') selectedSubjectIds = new Set();
        else if (selectedSubjectIds.has(id)) selectedSubjectIds.delete(id);
        else selectedSubjectIds.add(id);
        renderSubjectPills();
        buildList();
        syncSize();
    }

    async function onArchiveToggle() {
        if (elArchive.checked && !archiveCache) {
            listEl.innerHTML = '<div class="sm-empty">正在加载归档作业…</div>';
            syncSize();
            try { await getArchiveHomeworks(); } finally { buildList(); syncSize(); }
        } else {
            buildList();
            syncSize();
        }
    }

    // ---- 折叠筛选 ----
    function setupFilterToggle() {
        // 注意：筛选按钮在 .sm-filters 的兄弟层（.sm-root 直接子级），
        // 从 elFilters 内 querySelector 会取不到，必须从 root 查找。
        const toggleBtn = root && root.querySelector('.sm-filter-toggle');
        if (!toggleBtn) return;
        toggleBtn.addEventListener('click', () => {
            const filters = elFilters;
            if (!filters) return;
            const open = filters.classList.toggle('open');
            toggleBtn.classList.toggle('open', open);   // 驱动 chevron 旋转
            toggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
            syncSize();
            // 展开/收起是 0.35s 的 max-height 过渡，初始测量定格过早会裁切面板；
            // 待过渡结束后再补测一次，避免筛选区被 overflow:hidden 剪掉。
            clearTimeout(filtersResizeTimer);
            filtersResizeTimer = setTimeout(() => { if (microActive) syncSize(); }, 360);
        });
    }

    // ---- 打开微窗（更多菜单内变形）----
    // 【备份版保留】进入仍是原始的「从天而降」动画，非镜像形变。
    function open() {
        if (microActive || !panel) return;
        microActive = true;
        archiveCache = null;
        selectedSubjectIds = new Set();
        currentKw = '';
        currentTerms = [];

        const h0 = panel.offsetHeight; // 菜单态高度，作为变形动画起点

        buildMicroHtml();

        panel.classList.add('more-sheet-search');
        panel.style.height = h0 + 'px';

        // 第一步：渲染筛选胶囊与事件
        elFilters = root.querySelector('.sm-filters');
        elKw = root.querySelector('.sm-input');
        listEl = root.querySelector('.sm-list');
        elSummary = root.querySelector('.sm-summary');
        // elFrom / elTo / elArchive 在 buildMicroHtml 里已缓存 DOM 引用
        renderSubjectPills();
        setupFilterToggle();

        // Step 2：高度从菜单态收敛到「仅搜索框」的小尺寸
        requestAnimationFrame(() => requestAnimationFrame(() => {
            syncSize();
        }));

        // 搜索框「从天而降」到底部
        const box = root.querySelector('.sm-box');
        requestAnimationFrame(() => requestAnimationFrame(() => {
            if (box) box.classList.remove('sm-drop');
        }));

        elKw.addEventListener('input', scheduleDebounce);
        elKw.addEventListener('keydown', (e) => { if (e.key === 'Enter') { clearTimeout(debounceTimer); applySearch(); } });
        elFrom.addEventListener('change', applySearch);
        elTo.addEventListener('change', applySearch);
        elArchive.addEventListener('change', onArchiveToggle);

        // ESC：微窗内先返回菜单，再按则关闭（用捕获阶段以优先于 more-menu 的关闭逻辑）
        document.addEventListener('keydown', escHandler, true);

        requestAnimationFrame(() => { if (elKw) elKw.focus(); });
    }

    function escHandler(e) {
        if (e.key === 'Escape' && microActive) {
            e.stopImmediatePropagation();
            restore();
        }
    }

    function buildMicroHtml() {
        const dateInput = (id, label) =>
            `<label class="sm-date"><span>${label}</span>` +
            `<input type="date" id="${id}" class="sm-date-input"></label>`;

        root = document.createElement('div');
        root.className = 'sm-root';
        root.innerHTML = `
            <div class="sm-head">
                <button type="button" class="sm-back" aria-label="返回">‹</button>
                <span class="sm-title">作业搜索</span>
                <span class="sm-summary"></span>
            </div>

            <button type="button" class="sm-filter-toggle" aria-expanded="false">
                <span>筛选条件</span>
                <span class="sm-chevron"></span>
            </button>

            <div class="sm-filters">
                <div class="sm-caps"></div>
                <div class="sm-dates">
                    ${dateInput('smFrom', '从')}
                    <span class="sm-date-sep">—</span>
                    ${dateInput('smTo', '至')}
                </div>
                <label class="sm-archive">
                    <span>包含归档作业</span>
                    <input type="checkbox" id="smArchive">
                    <span class="sm-switch"></span>
                </label>
            </div>

            <div class="sm-list"></div>

            <div class="sm-box sm-drop">
                <img class="sm-box-icon" src="emoji/magnifying_glass_color.svg" alt="">
                <input type="text" class="sm-input" placeholder="搜索作业内容…" autocomplete="off">
            </div>
        `;

        // 缓存日期/归档 DOM 引用
        elFrom = root.querySelector('#smFrom');
        elTo = root.querySelector('#smTo');
        elArchive = root.querySelector('#smArchive');

        panel.innerHTML = '';
        panel.appendChild(root);

        const backBtn = root.querySelector('.sm-back');
        // 阻止冒泡：restore() 会重建面板内 DOM，旧返回按钮随即销毁；
        // 若不 stopImmediatePropagation，document 的"点击外部关闭菜单"会把
        // 已销毁的 target 判为外部而误关菜单（点击返回却回到主界面）。
        backBtn.addEventListener('click', (e) => {
            e.stopImmediatePropagation();
            e.preventDefault();
            restore();
        });
    }

    function restore() {
        if (!microActive) return;
        microActive = false;
        clearTimeout(debounceTimer);
        clearTimeout(filtersResizeTimer);
        document.removeEventListener('keydown', escHandler, true);

        const curH = panel.offsetHeight;
        const curW = panel.offsetWidth;

        // 先淡出当前搜索内容（保持面板尺寸，为后续「变形回缩」兜底）
        if (root) {
            root.style.transition = 'opacity 0.15s var(--transition-smooth)';
            root.style.opacity = '0';
        }

        setTimeout(() => {
            // 切回菜单内容，同时面板尺寸保持搜索态，容器不会瞬间坍缩
            panel.innerHTML = savedMenuHtml;
            panel.classList.remove('more-sheet-search');

            // 测定菜单内容自然尺寸（此段为同步回流，用户看不到中间态）
            panel.style.width = 'auto';
            panel.style.height = 'auto';
            const menuW = panel.offsetWidth;
            const menuH = panel.offsetHeight;
            panel.style.width = curW + 'px';
            panel.style.height = curH + 'px';
            panel.style.overflow = 'hidden';
            panel.style.opacity = '0';
            panel.style.transition =
                'width 0.4s var(--transition-spring), ' +
                'height 0.4s var(--transition-spring), ' +
                'opacity 0.25s var(--transition-smooth)';

            // 下一帧触发「宽度收窄 + 高度回缩 + 淡入」的变形还原
            requestAnimationFrame(() => {
                panel.style.width = menuW + 'px';
                panel.style.height = menuH + 'px';
                panel.style.opacity = '1';
            });

            // 动画结束后清除过渡残留，恢复菜单自身样式，并重新居中到更多按钮
            setTimeout(() => {
                panel.style.width = '';
                panel.style.height = '';
                panel.style.overflow = '';
                panel.style.opacity = '';
                panel.style.transition = '';
                if (window.AppMoreMenu && typeof window.AppMoreMenu.positionPanel === 'function') {
                    window.AppMoreMenu.positionPanel();
                }
            }, 460);

            root = null; listEl = null; elKw = null;
            // 面板内按钮 DOM 被重建，原事件失效，重新绑定
            if (window.AppMoreMenu && typeof window.AppMoreMenu.bindButtons === 'function') {
                window.AppMoreMenu.bindButtons();
            }
            elFilters = null; elSummary = null; elFrom = null; elTo = null; elArchive = null;
        }, 150);
    }

    function isActive() { return microActive; }

    window.AppSearch = { open, restore, isActive };
})();