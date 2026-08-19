// ============================================
// renderer.js
// 渲染引擎：卡片、底栏胶囊、日期、时钟、晚修进度
// 依赖：state、utils、layout、dialogs
// ============================================

(function () {
    const state = window.AppState;
    const { escapeHtml, hexToRgb, formatNumCircle, toast } = window.AppUtils;
    const { adjustContentPadding } = window.AppLayout;

    function getDialogs() { return window.AppDialogs; }
    function getStorage() { return window.AppStorage; }

    // 全局：当前激活卡片 id，用于点击外部时关闭
    let activeCardId = null;
    // 上一次渲染出现过的卡片 id：用于判断本次哪些是"新增"，
    // 只给新增卡片播放入场动画，避免删/改一张卡时整屏重播 cardPop。
    // null 表示首次渲染（首屏允许全部逐张弹出）；
    // 'skip' 表示本次跳过入场动画（用于 FLIP 重渲染，避免与位移过渡冲突）
    let prevCardIds = null;

    function closeAllCardActions(targetCard) {
        const cards = state.dom.cardsGrid()?.querySelectorAll('.homework-card');
        if (!cards) return;
        cards.forEach(c => {
            if (c !== targetCard) {
                c.classList.remove('card-active');
                const actions = c.querySelector('.card-actions');
                if (actions) actions.classList.remove('confirming');
            }
        });
        if (targetCard) {
            if (!targetCard.classList.contains('card-active')) activeCardId = null;
        } else {
            activeCardId = null;
        }
    }

    document.addEventListener('click', (e) => {
        if (!activeCardId) return;
        // 模态打开时跳过：即使未来 z-index 调整导致事件穿透，也不会误关卡片激活态
        if (document.body.classList.contains('modal-open')) return;
        const cardsGrid = state.dom.cardsGrid();
        if (!cardsGrid) return;
        const active = cardsGrid.querySelector(`[data-hw-id="${activeCardId}"]`);
        if (!active) { activeCardId = null; return; }
        if (!active.contains(e.target)) {
            active.classList.remove('card-active');
            const actions = active.querySelector('.card-actions');
            if (actions) actions.classList.remove('confirming');
            activeCardId = null;
        }
    });

    const Renderer = {
        renderCards() {
            const cardsGrid = state.dom.cardsGrid();
            if (!cardsGrid) return;

            cardsGrid.classList.toggle('cols-3', state.settings.cardColumns === 3);

            const fragment = document.createDocumentFragment();
            const viewDate = state.currentViewDate;
            // 浮窗模式中：正在浮窗/已关闭的卡片不在主窗口网格显示
            const fm = window.AppFloatingMode;
            const todays = state.homeworks.filter(hw => hw.date === viewDate && (!fm || !fm.shouldHideCard(hw.id)));

            if (todays.length === 0) {
                fragment.appendChild(document.createElement('div'));
            } else {
                let ordered;
                if (state.settings.cardColumns === 3) {
                    // 3列：跳过 JS 两列排序，按原始顺序追加，交给 CSS columns 自动排版
                    ordered = [...todays];
                } else {
                    // 2列：贪心平衡算法
                    const sorted = [...todays].sort((a, b) => b.content.length - a.content.length);
                    const leftCol = [];
                    const rightCol = [];
                    let leftLen = 0, rightLen = 0;
                    for (const hw of sorted) {
                        if (leftLen <= rightLen) {
                            leftCol.push(hw);
                            leftLen += hw.content.length;
                        } else {
                            rightCol.push(hw);
                            rightLen += hw.content.length;
                        }
                    }
                    ordered = [];
                    const maxLen = Math.max(leftCol.length, rightCol.length);
                    for (let i = 0; i < maxLen; i++) {
                        if (i < leftCol.length) ordered.push(leftCol[i]);
                        if (i < rightCol.length) ordered.push(rightCol[i]);
                    }
                }
                ordered.forEach((hw, idx) => {
                    const card = document.createElement('div');
                    card.className = 'homework-card';
                    card.dataset.hwId = hw.id;
                    // 首屏：全部逐张错位弹出；后续渲染：只有新增卡片弹出，且不延迟
                    // 'skip' 标记：FLIP 重渲染时跳过入场动画，避免 transform 冲突
                    const isFirstPaint = (prevCardIds === null);
                    const skipEnter = (prevCardIds === 'skip');
                    if (!skipEnter && (isFirstPaint || !prevCardIds.has(hw.id))) {
                        card.classList.add('card-enter');
                        card.style.animationDelay = isFirstPaint ? (idx * 0.04) + 's' : '0s';
                    }
                    card.setAttribute('role', 'button');
                    card.setAttribute('tabindex', '0');
                    card.setAttribute('aria-label', `${hw.subjectName} 作业`);

                    const subj = state.subjectList.find(s => s.id === hw.subjectId);
                    const color = subj ? subj.color : '#5b6abf';
                    card.style.setProperty('--subject-accent', color);
                    // 卡片背景追色：学科色基底白玻璃，30% 浓度让色调清晰可辨
                    const rgb = hexToRgb(color);
                    if (rgb) {
                        card.style.setProperty('--card-tint', `rgba(${rgb.r},${rgb.g},${rgb.b},0.30)`);
                    }
                    card.innerHTML = `
                        <div class="card-inner">
                            <div class="card-subject" style="color:${color}">
                                <span class="subject-dot" style="background:${color}"></span>
                                ${escapeHtml(hw.subjectName)}
                            </div>
                            <div class="card-content">${window.AppUtils.renderContentBySetting(hw.content, state.settings.beautifyNumber !== false)}</div>
                        </div>
                        <div class="card-actions" role="toolbar">
                            <button class="c-act c-edit" type="button" aria-label="编辑作业">
                                <span class="c-act-label">编辑</span>
                            </button>
                            <button class="c-act c-del" type="button" aria-label="删除作业">
                                <span class="c-act-label">删除</span>
                            </button>
                        </div>
                    `;

                    // 激活态切换
                    const toggleActive = (e) => {
                        if (e) e.stopPropagation();
                        closeAllCardActions(card);
                        const isActive = card.classList.toggle('card-active');
                        const actions = card.querySelector('.card-actions');
                        if (!isActive && actions) actions.classList.remove('confirming');
                        activeCardId = isActive ? hw.id : null;
                    };

                    card.addEventListener('click', (e) => {
                        // 按钮有自己的处理逻辑，不触发卡片的 toggle
                        if (e.target.closest('.c-act')) return;
                        toggleActive(e);
                    });
                    card.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            if (e.target.closest('.c-act')) return;
                            e.preventDefault();
                            toggleActive(e);
                        } else if (e.key === 'Escape') {
                            card.classList.remove('card-active');
                            const actions = card.querySelector('.card-actions');
                            if (actions) actions.classList.remove('confirming');
                            activeCardId = null;
                        }
                    });

                    // 编辑按钮
                    card.querySelector('.c-edit').addEventListener('click', (e) => {
                        e.stopPropagation();
                        const dlg = getDialogs();
                        card.classList.remove('card-active');
                        const actions = card.querySelector('.card-actions');
                        if (actions) actions.classList.remove('confirming');
                        activeCardId = null;
                        if (dlg) dlg.openModifyDialog(hw);
                    });

                    // 删除按钮：单击 → 进入确认态（编辑按钮消失，删除按钮扩大变红色）
                    //           确认态下再次单击 → 播放退场动画后删除
                    const delBtn = card.querySelector('.c-del');
                    const actionsLayer = card.querySelector('.card-actions');
                    let confirmingTimer = null;
                    delBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (actionsLayer.classList.contains('confirming')) {
                            // 第二次点击：播放退场动画后执行删除
                            // FLIP：先记录其他卡片旧位置，删除后让它们平滑滑到新位置
                            const grid = state.dom.cardsGrid();
                            const otherCards = grid
                                ? Array.from(grid.querySelectorAll('.homework-card')).filter(c => c !== card)
                                : [];
                            const oldRects = new Map();
                            otherCards.forEach(c => oldRects.set(c, c.getBoundingClientRect()));

                            card.classList.add('card-leaving');
                            card.addEventListener('animationend', async function onEnd(ev) {
                                if (ev.animationName !== 'cardOut') return;
                                card.removeEventListener('animationend', onEnd);
                                const newHomeworks = state.homeworks.filter(h => h.id !== hw.id);
                                const storage = getStorage();
                                const ok = await storage?.persistHomeworks?.(newHomeworks);
                                if (ok) {
                                    // 重渲染后用 FLIP 让后续卡片平滑补位
                                    Renderer.renderAllWithFlip(oldRects);
                                }
                                activeCardId = null;
                                if (confirmingTimer) clearTimeout(confirmingTimer);
                            });
                        } else {
                            // 第一次点击：进入确认态
                            actionsLayer.classList.add('confirming');
                            if (confirmingTimer) clearTimeout(confirmingTimer);
                            confirmingTimer = setTimeout(() => {
                                actionsLayer.classList.remove('confirming');
                            }, 5000);
                        }
                    });

                    fragment.appendChild(card);
                });
            }
            cardsGrid.innerHTML = '';
            cardsGrid.appendChild(fragment);
            // 记录本次渲染的卡片集合，供下次渲染判断"新增"
            prevCardIds = new Set(todays.map(h => h.id));
        },

        renderBottomPills() {
            const subjectPillsDiv = state.dom.subjectPills();
            const viewDate = state.currentViewDate;
            const addedIds = new Set(state.homeworks.filter(h => h.date === viewDate).map(h => h.subjectId));

            // 统计每个学科的 pending 候选数（用于强制显示胶囊）
            const qq = state.settings.qq;
            const pendingCounts = {};
            if (qq && Array.isArray(qq.pendingCandidates)) {
                qq.pendingCandidates.forEach(c => {
                    if (c.subjectId) pendingCounts[c.subjectId] = (pendingCounts[c.subjectId] || 0) + 1;
                });
            }

            // 首次创建 / 学科列表变更：重建节点并缓存
            if (!subjectPillsDiv.childElementCount || subjectPillsDiv.dataset.subjectsKey !== state.subjectList.map(s => s.id).join(',')) {
                subjectPillsDiv.innerHTML = '';
                state.subjectList.forEach(subj => {
                    const btn = document.createElement('button');
                    btn.className = 'subject-pill';
                    btn.dataset.subjectId = subj.id;
                    btn.style.setProperty('--pill-color', subj.color);
                    btn.style.setProperty('--pill-bg', subj.color + '18');
                    btn.setAttribute('role', 'tab');
                    btn.setAttribute('aria-label', `添加 ${subj.name} 作业`);
                    // 内部结构：文字放入 span，避免 textContent 破坏徽章子元素
                    const textSpan = document.createElement('span');
                    textSpan.className = 'pill-text';
                    textSpan.textContent = subj.name;
                    btn.appendChild(textSpan);
                    btn.addEventListener('click', () => {
                        if (window.QQPending) {
                            window.QQPending.handlePillClick(subj, () => {
                                const dlg = getDialogs();
                                if (dlg) dlg.openAddDialog(subj);
                            });
                        } else {
                            const dlg = getDialogs();
                            if (dlg) dlg.openAddDialog(subj);
                        }
                    });
                    subjectPillsDiv.appendChild(btn);
                });
                subjectPillsDiv.dataset.subjectsKey = state.subjectList.map(s => s.id).join(',');
            }

            // 更新 hidden 状态（复用节点，触发 CSS 过渡）
            // 有 pending 候选时强制显示，不受 hasHW 影响
            subjectPillsDiv.querySelectorAll('.subject-pill').forEach(btn => {
                const subjId = btn.dataset.subjectId;
                const hasHW = addedIds.has(subjId);
                const hasPending = (pendingCounts[subjId] || 0) > 0;

                // 收起/展开全部交给 CSS 的 max-width 过渡，不再手动锁 width：
                // 旧写法在展开时读到的是被压成 0 的宽度，再设 auto 无法过渡，会瞬间弹开
                if (hasHW && !hasPending) {
                    if (!btn.classList.contains('hidden-pill')) {
                        btn.classList.add('hidden-pill');
                    }
                } else {
                    if (btn.classList.contains('hidden-pill')) {
                        btn.classList.remove('hidden-pill');
                    }
                    // 清掉历史遗留的内联宽度，避免旧值把过渡钉死
                    if (btn.style.width) btn.style.width = '';
                }
            });

            // 更新 QQ 候选作业徽标
            if (window.QQPending) window.QQPending.updatePendingBadge();
        },

        updateDateDisplay() {
            const viewDate = state.currentViewDate;
            const d = window.AppUtils.parseLocalDate(viewDate);
            const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
            const todayStr = window.AppUtils.localDateStr();
            state.dom.dateText().textContent = viewDate === todayStr
                ? '今天'
                : `${d.getMonth() + 1}月${d.getDate()}日 周${weekdays[d.getDay()]}`;
        },

        updateEveningProgress() {
            const now = new Date();
            const currentMinutes = now.getHours() * 60 + now.getMinutes();
            let activeSection = null;
            for (let i = 0; i < state.settings.eveningSections.length; i++) {
                const sec = state.settings.eveningSections[i];
                const [sh, sm] = sec.start.split(':').map(Number);
                const [eh, em] = sec.end.split(':').map(Number);
                const startMin = sh * 60 + sm;
                const endMin = eh * 60 + em;
                if (currentMinutes >= startMin && currentMinutes < endMin) {
                    activeSection = { index: i, startMin, endMin };
                    break;
                }
            }
            if (activeSection) {
                const elapsed = currentMinutes - activeSection.startMin;
                const total = activeSection.endMin - activeSection.startMin;
                const percent = Math.min(100, Math.round((elapsed / total) * 100));
                state.dom.eveningLabel().innerHTML = emoji('🌙') + ` 第${activeSection.index + 1}节晚修`;
                const h = Math.floor(elapsed / 60);
                const m = elapsed % 60;
                state.dom.eveningTime().textContent = h > 0 ? `${h}h${m}min` : `${m}min`;
                state.dom.progressFill().style.width = percent + '%';
                const bar = state.dom.progressBar();
                if (bar) bar.setAttribute('aria-valuenow', percent);
            } else {
                state.dom.eveningLabel().innerHTML = emoji('🌙') + ' 未在晚修';
                state.dom.eveningTime().textContent = '--';
                state.dom.progressFill().style.width = '0%';
                const bar = state.dom.progressBar();
                if (bar) bar.setAttribute('aria-valuenow', 0);
            }
        },

        updateClock() {
            const now = new Date();
            state.dom.clockDisplay().textContent = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
            this.updateEveningProgress();
        },

        renderAll() {
            this.renderCards();
            this.renderBottomPills();
            this.updateDateDisplay();
            this.updateClock();
            setTimeout(adjustContentPadding, 50);
        },

        renderAllWithAnimation() {
            const cardsGrid = state.dom.cardsGrid();
            if (!cardsGrid) { this.renderAll(); return; }

            cardsGrid.classList.add('fading');
            setTimeout(() => {
                this.renderCards();
                this.renderBottomPills();
                this.updateDateDisplay();
                this.updateClock();
                cardsGrid.classList.remove('fading');
                setTimeout(adjustContentPadding, 50);
            }, 200);
        },

        // FLIP 动画重渲染：传入删除前其他卡片的旧位置 Map<element, rect>，
        // 重渲染后计算 delta，用 transform 平滑过渡到新位置（iOS 删除 App 式补位）
        renderAllWithFlip(oldRects) {
            const cardsGrid = state.dom.cardsGrid();
            if (!cardsGrid || !oldRects || oldRects.size === 0) {
                this.renderAll();
                return;
            }
            // 重渲染 DOM（不带入场动画，避免与 FLIP 位移冲突）
            const prevPrev = prevCardIds;
            prevCardIds = 'skip'; // 跳过入场动画
            this.renderCards();
            this.renderBottomPills();
            this.updateDateDisplay();
            this.updateClock();
            setTimeout(adjustContentPadding, 50);

            // 用 data-hw-id 找到新卡片，与旧位置匹配
            const newCards = Array.from(cardsGrid.querySelectorAll('.homework-card'));
            const flipCards = [];
            newCards.forEach(newCard => {
                const hwId = newCard.getAttribute('data-hw-id');
                // 按 id 找旧元素：旧 Map 的 key 是旧 DOM 节点（已不在 DOM 中），
                // 所以重建一张 id->rect 的索引
                let oldRect = null;
                oldRects.forEach((rect, oldEl) => {
                    if (oldEl.getAttribute('data-hw-id') === hwId) oldRect = rect;
                });
                if (!oldRect) return;
                const newRect = newCard.getBoundingClientRect();
                const dx = oldRect.left - newRect.left;
                const dy = oldRect.top - newRect.top;
                if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return; // 未移动，跳过
                flipCards.push({ el: newCard, dx, dy });
            });

            if (flipCards.length === 0) {
                prevCardIds = prevPrev;
                return;
            }

            // First：先瞬间把卡片位移到旧位置（不触发过渡）
            flipCards.forEach(({ el, dx, dy }) => {
                el.style.transition = 'none';
                el.style.transform = `translate(${dx}px, ${dy}px)`;
            });
            // 强制刷新，确保浏览器记录"旧位置"
            void cardsGrid.offsetWidth;
            // Last：启用过渡，清除 transform，平滑滑到新位置
            flipCards.forEach(({ el }) => {
                el.style.transition = 'transform 0.42s var(--transition-smooth), box-shadow 0.4s var(--transition-smooth)';
                el.style.transform = '';
            });
            // 过渡结束后清理 inline 样式，恢复 hover 等正常行为
            const cleanup = () => {
                flipCards.forEach(({ el }) => {
                    el.style.transition = '';
                    el.style.transform = '';
                });
                cardsGrid.removeEventListener('transitionend', onTransEnd);
                prevCardIds = prevPrev;
            };
            const onTransEnd = (ev) => {
                if (ev.propertyName !== 'transform') return;
                cleanup();
            };
            cardsGrid.addEventListener('transitionend', onTransEnd);
            // 兜底：超时后强制清理，避免 transitionend 漏触发导致 inline 样式残留
            setTimeout(cleanup, 520);
        }
    };

    window.Renderer = Renderer;
    window.AppRenderer = Renderer;
})();
