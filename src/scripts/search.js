// ============================================
// search.js
// 作业搜索微窗（更多菜单内原地变形）
//   - 点击「作业搜索」后，更多菜单面板变形为搜索微窗
//   - 搜索框固定在微窗最底部，打开时从天而降
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

        listEl.innerHTML = '';
        if (elSummary) elSummary.textContent = '';

        // 严格版：只要没有关键词，就一律提示输入关键词，不展示任何结果。
        // 哪怕勾了归档、选了学科、设了日期区间，也要先输入关键词才能看到列表，
        // 避免清空关键词后误以为「搜索结果还在」。
        if (!currentKw) {
            const hint = document.createElement('div');
            hint.className = 'sm-empty';
            hint.textContent = '输入关键词开始搜索';
            listEl.appendChild(hint);
            return;
        }

        const base = collectBase(incArchive);
        let matched = base.filter(h => filterByCriteria(h, from, to));

        // 排序：column-reverse 下 DOM 最前显示在列表最底部，故按相关度降序
        // （最匹配排最前 → 落在底部），恰好「越往下越匹配」。
        if (currentKw) matched.sort((a, b) => computeScore(b) - computeScore(a));
        else matched.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

        if (elSummary) elSummary.textContent = matched.length ? `${matched.length} 条匹配` : '';

        if (matched.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'sm-empty';
            empty.textContent = incArchive ? '未找到匹配的作业' : '没有匹配的作业（点 ⋮ 筛选可看归档）';
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
        updateMoreState();
    }

    // ---- 尺寸动画：无结果时小，有结果时丝滑撑大 ----
    // 筛选浮层（.sm-filter-pop）用 fixed 定位，不参与文档流、不占 root 高度，
    // 因此测量基准不再受筛选展开/收起影响，可直接量 root。
    function syncSize() {
        if (!microActive || !root || !listEl || !panel) return;
        panel.style.overflow = 'hidden';

        listEl.style.height = '0px';

        // 临时把容器高度设为 auto，解除「面板固定高度」对 root 的 flex 收缩约束
        const savedPanelH = panel.style.height;
        panel.style.height = 'auto';

        const base = root.offsetHeight;          // 不含结果区的高度

        panel.style.height = savedPanelH;         // 还原容器高度
        // 测量 listEl 内容高度前必须用 auto 兜底：若这里还保留上一轮撑开的
        // 大高度（如 300px），在 overflow:auto 下 scrollHeight 会被读高，
        // 导致清空关键词后弹窗缩不回去。
        listEl.style.height = 'auto';
        const content = listEl.scrollHeight;
        const lh = content > 0 ? Math.min(content, MAX_LIST) : 0;
        listEl.style.height = lh + 'px';

        const maxH = Math.max(120, Math.floor(window.innerHeight * 0.55));
        panel.style.height = Math.min(base + lh, maxH) + 'px';
    }

    // 同步「全部/学科」胶囊的选中态。只切换 class，绝不重建 DOM：
    // 若用 innerHTML 清空重建，点击目标会被销毁，冒泡到 document 时
    // e.target.closest('.sm-filter-pop') 会失效，导致误关菜单（历史 bug 根因）。
    function syncSubjectActive() {
        const wrap = elFilters && elFilters.querySelector('.sm-caps');
        if (!wrap) return;
        const subjects = state.subjectList || [];
        // selectedSubjectIds 为空即视为选中「全部」；无学科时也点亮「全部」
        const allOn = selectedSubjectIds.size === 0 || subjects.length === 0;
        wrap.querySelectorAll('.sm-subj').forEach(b => {
            const on = b.dataset.id === '__all__' ? allOn : selectedSubjectIds.has(b.dataset.id);
            b.classList.toggle('active', on);
        });
    }

    // 胶囊容器事件委托：命中胶囊才交回 toggleSubject，点击时目标不被销毁
    function onSubjectCapsClick(e) {
        const wrap = elFilters && elFilters.querySelector('.sm-caps');
        if (!wrap) return;
        const btn = e.target.closest && e.target.closest('.sm-subj');
        if (!btn || !wrap.contains(btn)) return;
        toggleSubject(btn.dataset.id);
    }

    function renderSubjectPills() {
        if (!elFilters) return;
        // 一次性构建胶囊 DOM + 事件委托（wrap 每次随浮层 innerHTML 新建，不会重复绑定）
        const wrap = elFilters.querySelector('.sm-caps');
        if (!wrap) return;
        wrap.innerHTML = '';
        const subjects = state.subjectList || [];
        const mk = (id, label, color) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'sm-subj';
            if (color) b.style.setProperty('--subj-accent', color);
            b.textContent = label;
            b.dataset.id = String(id);
            return b;
        };
        wrap.appendChild(mk('__all__', '全部', null));
        for (const s of subjects) wrap.appendChild(mk(s.id, s.name, s.color));
        wrap.addEventListener('click', onSubjectCapsClick);
        syncSubjectActive();
    }

    function toggleSubject(id) {
        if (id === '__all__') selectedSubjectIds = new Set();
        else if (selectedSubjectIds.has(id)) selectedSubjectIds.delete(id);
        else selectedSubjectIds.add(id);
        syncSubjectActive();   // 仅更新选中态，不重建胶囊
        buildList();
        syncSize();
        updateMoreState();
    }

    async function onArchiveToggle() {
        if (elArchive.checked && !archiveCache) {
            listEl.innerHTML = '<div class="sm-empty">正在加载归档作业…</div>';
            syncSize();
            try { await getArchiveHomeworks(); } finally { buildList(); syncSize(); updateMoreState(); }
        } else {
            buildList();
            syncSize();
            updateMoreState();
        }
    }

    // ---- 筛选浮层（溢出菜单弹窗）----
    function hasActiveFilter() {
        return selectedSubjectIds.size > 0 ||
            !!(elFrom && elFrom.value) ||
            !!(elTo && elTo.value) ||
            !!(elArchive && elArchive.checked);
    }

    // 有任一筛选生效时，让 ⋮ 按钮变主题色，作为「筛选已开启」的可见标记
    function updateMoreState() {
        const more = root && root.querySelector('.sm-more');
        if (!more) return;
        more.classList.toggle('active', hasActiveFilter());
    }

    function openPop() {
        const more = root && root.querySelector('.sm-more');
        const box = root && root.querySelector('.sm-box');
        if (!elFilters || !more || !box) return;
        // 定位前先隐藏测量尺寸，避免闪现
        elFilters.style.visibility = 'hidden';
        const pw = elFilters.offsetWidth;
        const ph = elFilters.offsetHeight;
        const r = box.getBoundingClientRect();
        const gap = 10, pad = 8;
        const top = r.top - ph - gap;
        const down = top < pad;   // 上方放不下就翻到搜索框下方
        let left = r.right - pw;
        left = Math.max(pad, Math.min(left, window.innerWidth - pw - pad));
        elFilters.style.top = (down ? r.bottom + gap : top) + 'px';
        elFilters.style.left = left + 'px';
        elFilters.style.transformOrigin = (down ? 'top right' : 'bottom right');
        elFilters.style.visibility = '';
        const moreBtn = more;
        moreBtn.setAttribute('aria-expanded', 'true');
        requestAnimationFrame(() => { elFilters.classList.add('open'); });
    }

    function closePop() {
        if (!elFilters) return;
        elFilters.classList.remove('open');
        const moreBtn = root && root.querySelector('.sm-more');
        if (moreBtn) moreBtn.setAttribute('aria-expanded', 'false');
    }

    function togglePop() {
        if (elFilters && elFilters.classList.contains('open')) closePop();
        else openPop();
    }

    // 点击微窗外部区域时收起浮层（浮层现在挂 body，故须同时排除它自身）。
    // 仅当焦点位于「原生日期选择器」输入框且该输入框在浮层内时，才视为内部
    // （原生日历弹出后点选的 click 目标不在文档树里，只能靠焦点兜底）。
    // 若笼统地把「焦点在浮层内」都算内部，点击普通开关后焦点残留，
    // 会导致浮层再也无法通过外部点击收起。
    function onDocDown(e) {
        if (!microActive || !elFilters || !elFilters.classList.contains('open')) return;
        const t = e.target;
        if (t.closest && (t.closest('.sm-root') || t.closest('.sm-filter-pop'))) return;
        const ae = document.activeElement;
        if (ae &&
            ae.classList && ae.classList.contains('sm-date-input') &&
            ae.closest && ae.closest('.sm-filter-pop')) return;
        closePop();
    }

    function setupFilterPopup() {
        const moreBtn = root && root.querySelector('.sm-more');
        if (moreBtn) moreBtn.addEventListener('click', (e) => {
            e.stopImmediatePropagation();
            togglePop();
        });
        document.addEventListener('mousedown', onDocDown, true);
    }

    // ---- 打开微窗（更多菜单内原地变形，与 restore 镜像）----
    function open() {
        if (microActive || !panel) return;
        microActive = true;
        archiveCache = null;
        selectedSubjectIds = new Set();
        currentKw = '';
        currentTerms = [];

        const w0 = panel.offsetWidth;   // 菜单自然宽，作为变形动画起点
        const h0 = panel.offsetHeight;  // 菜单自然高

        // 第 0 步：仅淡出菜单「内容」，保留玻璃面板本身，
        // 避免面板整体淡成全透明而出现「空档闪白」。
        Array.from(panel.children).forEach(el => {
            el.style.transition = 'opacity 0.11s var(--transition-smooth)';
            el.style.opacity = '0';
        });

        setTimeout(() => {
            // 第 1 步：切入搜索内容，并「钉住」在菜单尺寸上，容器不瞬间坍缩/膨胀
            buildMicroHtml();
            panel.classList.add('more-sheet-search');
            panel.style.width = w0 + 'px';
            panel.style.height = h0 + 'px';
            panel.style.overflow = 'hidden';
            panel.style.transition =
                'width 0.45s var(--transition-spring), ' +
                'height 0.45s var(--transition-spring), ' +
                'opacity 0.25s var(--transition-smooth)';

            // 搜索内容初始透明，随形变一起淡入（玻璃面板全程在，无空档）
            root.style.opacity = '0';
            root.style.transition = 'opacity 0.25s var(--transition-smooth)';

            // 渲染筛选胶囊与事件（elFilters 已在 buildMicroHtml 中赋值并挂到 body）
            elKw = root.querySelector('.sm-input');
            listEl = root.querySelector('.sm-list');
            elSummary = root.querySelector('.sm-summary');
            // elFrom / elTo / elArchive 在 buildMicroHtml 里已缓存 DOM 引用
            renderSubjectPills();
            setupFilterPopup();

            const box = root.querySelector('.sm-box');

            elKw.addEventListener('input', scheduleDebounce);
            elKw.addEventListener('keydown', (e) => { if (e.key === 'Enter') { clearTimeout(debounceTimer); applySearch(); } });
            elFrom.addEventListener('change', applySearch);
            elTo.addEventListener('change', applySearch);
            elArchive.addEventListener('change', onArchiveToggle);
            // ESC：微窗内先返回菜单，再按则关闭（用捕获阶段以优先于 more-menu 的关闭逻辑）
            document.addEventListener('keydown', escHandler, true);

            // 第 2 步：下一帧统一触发「宽度伸展 + 高度收敛 + 内容淡入 + 搜索盒坠落」
            // 钉住的值先提交一帧，再一并改变，才能让 弹簧过渡 从起点跑到终点。
            requestAnimationFrame(() => requestAnimationFrame(() => {
                buildList();                 // 初始渲染提示「输入关键词开始搜索」
                syncSize();                    // 量出搜索态目标高度，触发 h0→H 收敛
                panel.style.width = '';        // 交还 .more-sheet-search 的 400px，触发 w0→400
                root.style.opacity = '1';      // 淡入搜索内容
                if (box) box.classList.remove('sm-drop'); // 搜索盒「从天而降」
                updateMoreState();             // 初始化 ⋮ 高亮态（无筛选时不亮）
            }));

            requestAnimationFrame(() => { if (elKw) elKw.focus(); });
        }, 120);
    }

    function escHandler(e) {
        if (e.key === 'Escape' && microActive) {
            e.stopImmediatePropagation();
            if (elFilters && elFilters.classList.contains('open')) closePop();
            else restore();
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

            <div class="sm-list"></div>

            <div class="sm-box sm-drop">
                ${emoji('🔍')}
                <input type="text" class="sm-input" placeholder="搜索作业内容…" autocomplete="off">
                <button type="button" class="sm-more" aria-label="筛选" aria-haspopup="true" aria-expanded="false">
                    <span class="sm-more-dots"><i></i><i></i><i></i></span>
                </button>
            </div>

            <div class="sm-filter-pop" role="dialog" aria-label="筛选">
                <div class="sm-pop-cap">筛选</div>
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
        `;

        // 缓存日期/归档 DOM 引用
        elFrom = root.querySelector('#smFrom');
        elTo = root.querySelector('#smTo');
        elArchive = root.querySelector('#smArchive');

        // 浮层必须挂到 document.body：菜单面板 .more-sheet-panel 带 transform，
        // 会让 position:fixed 的子元素退化为「相对面板定位」，按视口坐标对齐会错位。
        if (elFilters && elFilters.parentNode === document.body) elFilters.remove();
        elFilters = root.querySelector('.sm-filter-pop');
        if (elFilters) document.body.appendChild(elFilters);

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
        document.removeEventListener('keydown', escHandler, true);
        document.removeEventListener('mousedown', onDocDown, true);

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
            // 卸载挂到 body 的筛选浮层
            if (elFilters && elFilters.parentNode === document.body) elFilters.remove();

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