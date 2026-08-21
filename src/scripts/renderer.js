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
                cardsGrid.classList.add('grid-empty-state');
                const hint = document.createElement('div');
                hint.className = 'grid-empty';
                hint.textContent = '今天还没有作业，点下方学科按钮添加';
                fragment.appendChild(hint);
            } else {
                cardsGrid.classList.remove('grid-empty-state');
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
            // Last：启用过渡，清除 transform，平滑滑到新位置（减弱动画时缩短时长、去掉回弹）
            const reduced = !!state.settings.reduceAnimation;
            const MOVE = reduced
                ? 'transform 0.2s ease, box-shadow 0.2s ease'
                : 'transform 0.42s var(--transition-soft-spring), box-shadow 0.4s var(--transition-smooth)';
            flipCards.forEach(({ el }) => {
                el.style.transition = MOVE;
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
            setTimeout(cleanup, reduced ? 280 : 520);
        },

        // 日期切换滑切转场：双「屏」并排平推（新屏从目标侧滑入、旧屏反向滑出）
        // dir > 0 切未来(+1 天) → 新屏从右滑入；dir < 0 切过去 → 新屏从左滑入
        // 每屏是独立层并继承网格的多列布局（columns），整层用「整屏宽度」像素级平移，
        // 保证卡片保持原分列排布整体滑切，而不是逐张卡片平移导致错乱。
        renderAllWithSlide(dir) {
            const grid = state.dom.cardsGrid();
            if (!grid) { this.renderAll(); return; }
            // 若上一轮转场未结束，先干净复位再开始（避免动画叠加）
            this._endSlide();
            // 本轮唯一序号：防止上一轮的「迟到收尾」回调错清本轮刚设置的状态（并发/交错切换的串扰）
            const seq = (this._slideSeq = (this._slideSeq || 0) + 1);

            const dirX = dir > 0 ? 1 : -1;
            // 继承网格的多列布局与列距，让新旧「屏」内卡片保持与原布局一致的分列
            const cs = getComputedStyle(grid);
            const cols = cs.columnCount;
            const gap = cs.columnGap;

            // 0) 先量旧屏真实内容高度（此时卡片仍在网格流式里），用于锁高与复位
            const oldH = grid.scrollHeight;

            // 1) 把现有卡片全部移入绝对定位的「旧屏」层（带上多列布局）
            const oldLayer = document.createElement('div');
            oldLayer.className = 'card-slide-layer';
            oldLayer.style.columnCount = cols;
            oldLayer.style.columnGap = gap;
            grid.querySelectorAll(':scope > *').forEach((c) => oldLayer.appendChild(c));
            grid.appendChild(oldLayer);

            // 2) 进入滑切状态（横向裁剪防两屏横移产生横向滚动条；高度暂不设，见 step 4.5）
            grid.classList.add('card-slide-on');

            // 3) 渲染新卡片（跳过入场动画，避免与位移过渡冲突）
            const prevPrev = prevCardIds;
            prevCardIds = 'skip';
            this.renderCards();
            this.renderBottomPills();
            this.updateDateDisplay();
            this.updateClock();
            prevCardIds = prevPrev;

            // 4) 把新卡片移入绝对定位的「新屏」层（同样带上多列布局），叠在旧屏之上
            const newLayer = document.createElement('div');
            newLayer.className = 'card-slide-layer';
            newLayer.style.columnCount = cols;
            newLayer.style.columnGap = gap;
            grid.querySelectorAll(':scope > :not(.card-slide-layer)').forEach((c) => newLayer.appendChild(c));
            grid.appendChild(newLayer);

            this._slideLayer = oldLayer;
            this._slideNewLayer = newLayer;
            this._slideGrid = grid;

            // 4.5) 锁定高度取两屏最大值：保证新屏内容从动画一开始就完整显示，
            // 不会被压缩成旧屏高度再弹开（避免“先按少的显示、再扩大”的割裂感）
            const newH = newLayer.scrollHeight;
            grid.style.height = Math.max(oldH, newH) + 'px';

            // 整屏宽度作为位移量：保证「屏」作为一个整体完全移出/移入可视区域
            const pix = grid.clientWidth;
            const reduced = !!state.settings.reduceAnimation;

            // 5) 新屏初始先停在目标状态（滑切=目标侧一个整屏宽；减弱=透明即可），不触发过渡
            newLayer.style.transition = 'none';
            if (reduced) {
                newLayer.style.opacity = '0';
                newLayer.style.transform = 'none';
            } else {
                newLayer.style.transform = `translateX(${dirX * pix}px)`;
            }

            // 6) 播放：滑切=平移交换；减弱=纯淡入淡出（真实减小运动量）
            requestAnimationFrame(() => requestAnimationFrame(() => {
                if (reduced) {
                    const FADE = 'opacity 0.3s ease';
                    newLayer.style.transition = FADE;
                    newLayer.style.opacity = '1';
                    oldLayer.style.transition = FADE;
                    oldLayer.style.opacity = '0';
                } else {
                    const TRANS = `transform 0.5s var(--transition-push)`;
                    newLayer.style.transition = TRANS;
                    newLayer.style.transform = 'translateX(0)';
                    oldLayer.style.transition = TRANS;
                    oldLayer.style.transform = `translateX(${-dirX * pix}px)`;
                }

                // 7) 滑动结束后：外层高度从「两屏最大值」过渡回新屏实际高度，再整体复位
                this._slideTimer = setTimeout(() => {
                    this._slideTimer = null;
                    // 若在本轮播放期间又被新一轮切换打断（seq 已前进），则本轮的收尾交棒给新轮，
                    // 不再触碰 grid，避免串扰
                    if (this._slideSeq !== seq) return;

                    grid.style.transition = 'height 0.32s var(--transition-smooth)';
                    grid.style.height = newH + 'px';

                    const settle = () => {
                        if (this._slideSeq !== seq) return;   // 已被新轮接管，忽略旧收尾
                        this._finishSlide();
                    };
                    grid.addEventListener('transitionend', function onHeight(ev) {
                        if (ev.target !== grid || ev.propertyName !== 'height') return;
                        grid.removeEventListener('transitionend', onHeight);
                        settle();
                    });
                    // 兜底：即使高度未变化也复位，避免 inline 样式残留
                    setTimeout(settle, 420);
                    // 安全网：极端繁忙下若上述收尾定时器被吞噬，1.5s 后仍兜底清干净
                    setTimeout(() => { if (this._slideSeq === seq) this._endSlide(); }, 1500);
                }, 520);
            }));
        },

        // 复位滑切转场产生的临时样式与快照层（幂等，可随时调用）
        _endSlide() {
            if (this._slideTimer) { clearTimeout(this._slideTimer); this._slideTimer = null; }
            const grid = this._slideGrid;
            if (grid) {
                grid.classList.remove('card-slide-on');
                grid.style.height = '';
                grid.style.transition = '';
                // 旧屏整层直接移除（旧卡片已被新屏替换丢弃）
                if (this._slideLayer && this._slideLayer.parentNode === grid) this._slideLayer.remove();
                // 新屏：把卡片迁回网格流式布局后再移除空层，保证后续增删改都基于 grid 正常结构
                const nl = this._slideNewLayer;
                if (nl && nl.parentNode === grid) {
                    const cards = Array.prototype.slice.call(nl.children);
                    cards.forEach((c) => grid.appendChild(c));
                    nl.remove();
                }
                this._slideLayer = null;
                this._slideNewLayer = null;
                this._slideGrid = null;
            }
        },
        _finishSlide() {
            this._endSlide();
            setTimeout(adjustContentPadding, 50);
        }
    };

    window.Renderer = Renderer;
    window.AppRenderer = Renderer;
})();
