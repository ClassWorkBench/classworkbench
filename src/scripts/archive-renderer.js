// ============================================
// archive-renderer.js
// 归档查看：内嵌视图（嵌入设置模态框内），只读模式
// 复用主界面的卡片渲染风格，但不支持增删改
// ============================================

(function () {
    'use strict';

    const { escapeHtml, formatNumCircle, toast } = window.AppUtils;
    const api = window.electronAPI;

    // 在指定 root（归档视图容器）内初始化；onBack 为点击"返回设置"的回调
    function mountArchiveView(root, onBack) {
        if (!root) return;

        const monthsList = [];
        let currentMonthIndex = -1;
        let currentMonthData = [];
        let arrowsVisible = false;
        let capsule = null;

        function formatMonthLabel(monthKey) {
            const [year, month] = monthKey.split('-');
            return `${year}年${parseInt(month)}月`;
        }

        function renderCards() {
            const cardsGrid = root.querySelector('.archive-cards');
            if (!cardsGrid) return;

            const fragment = document.createDocumentFragment();

            if (currentMonthData.length === 0) {
                const empty = document.createElement('div');
                empty.style.cssText = 'text-align:center;padding:60px 20px;color:var(--text-muted);font-size:1.1rem;';
                empty.textContent = '该月份暂无归档作业';
                fragment.appendChild(empty);
            } else {
                const sorted = [...currentMonthData].sort((a, b) => b.content.length - a.content.length);
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
                const ordered = [];
                const maxLen = Math.max(leftCol.length, rightCol.length);
                for (let i = 0; i < maxLen; i++) {
                    if (i < leftCol.length) ordered.push(leftCol[i]);
                    if (i < rightCol.length) ordered.push(rightCol[i]);
                }
                ordered.forEach((hw, idx) => {
                    const card = document.createElement('div');
                    // 归档面板每次打开都是整批全新渲染，始终走逐张错位入场
                    card.className = 'homework-card archive-card card-enter';
                    card.dataset.hwId = hw.id;
                    card.style.animationDelay = (idx * 0.04) + 's';

                    const color = hw.subjectColor || '#5b6abf';
                    card.style.setProperty('--subject-accent', color);
                    const rgb = window.AppUtils.hexToRgb(color);
                    if (rgb) {
                        card.style.setProperty('--card-tint', `rgba(${rgb.r},${rgb.g},${rgb.b},0.30)`);
                    }
                    card.innerHTML = `
                        <div class="card-inner">
                            <div class="card-subject" style="color:${color}">
                                <span class="subject-dot" style="background:${color}"></span>
                                ${escapeHtml(hw.subjectName)}
                            </div>
                            <div class="card-content">${window.AppUtils.renderContentBySetting(hw.content, window.AppState.settings.beautifyNumber !== false)}</div>
                        </div>
                    `;
                    fragment.appendChild(card);
                });
            }
            cardsGrid.innerHTML = '';
            cardsGrid.appendChild(fragment);
        }

        function updateMonthDisplay() {
            const dateText = root.querySelector('.archive-date-text');
            const monthDisplay = root.querySelector('.archive-month-display');
            if (currentMonthIndex >= 0 && currentMonthIndex < monthsList.length) {
                const monthKey = monthsList[currentMonthIndex];
                const label = formatMonthLabel(monthKey);
                if (dateText) dateText.textContent = label;
                if (monthDisplay) monthDisplay.textContent = label;
            } else {
                if (dateText) dateText.textContent = '无归档';
                if (monthDisplay) monthDisplay.textContent = '暂无归档数据';
            }
        }

        // 根据当前月份位置更新上/下箭头的灰态
        function updateArrowState() {
            const prevBtn = root.querySelector('.archive-prev');
            const nextBtn = root.querySelector('.archive-next');
            const atStart = currentMonthIndex <= 0;
            const atEnd = currentMonthIndex < 0 || currentMonthIndex >= monthsList.length - 1;
            if (prevBtn) prevBtn.classList.toggle('arrow-disabled', atStart);
            if (nextBtn) nextBtn.classList.toggle('arrow-disabled', atEnd);
        }

        async function selectMonth(idx) {
            if (idx < 0 || idx >= monthsList.length) return;
            currentMonthIndex = idx;
            const monthKey = monthsList[idx];
            try {
                currentMonthData = await api.archiveLoadMonth(monthKey);
            } catch (e) {
                console.error('加载归档月份数据失败:', e);
                currentMonthData = [];
                toast('加载失败');
            }

            const cardsGrid = root.querySelector('.archive-cards');
            if (cardsGrid) {
                cardsGrid.classList.add('fading');
                setTimeout(() => {
                    renderCards();
                    updateMonthDisplay();
                    updateArrowState();
                    cardsGrid.classList.remove('fading');
                }, 200);
            } else {
                renderCards();
                updateMonthDisplay();
                updateArrowState();
            }
        }

        function changeMonth(delta) {
            const newIdx = currentMonthIndex + delta;
            if (newIdx < 0) {
                toast('已经是最早的归档了');
                return;
            }
            if (newIdx >= monthsList.length) {
                toast('已经是最新的归档了');
                return;
            }
            selectMonth(newIdx);
        }

        function showArrows() {
            const capsule = root.querySelector('.archive-bottom');
            if (capsule) capsule.classList.add('date-active');
            arrowsVisible = true;
        }

        function hideArrows() {
            const capsule = root.querySelector('.archive-bottom');
            if (capsule) capsule.classList.remove('date-active');
            arrowsVisible = false;
        }

        function toggleArrows() {
            if (arrowsVisible) hideArrows();
            else showArrows();
        }

        function onDocClick(e) {
            if (arrowsVisible && capsule && !capsule.contains(e.target) && root.contains(e.target)) {
                hideArrows();
            }
        }

        async function init() {
            let list = [];
            try {
                list = await api.archiveGetMonths();
            } catch (e) {
                console.error('获取归档月份列表失败:', e);
                list = [];
            }
            monthsList.push(...list);

            if (monthsList.length === 0) {
                const cardsGrid = root.querySelector('.archive-cards');
                if (cardsGrid) {
                    cardsGrid.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--text-muted);font-size:1.1rem;">暂无已归档的作业</div>';
                }
                const monthDisplay = root.querySelector('.archive-month-display');
                if (monthDisplay) monthDisplay.textContent = '暂无归档数据';
                return;
            }

            // 默认选最近的月份（列表最后一项）
            await selectMonth(monthsList.length - 1);

            // 事件绑定
            const dateBtn = root.querySelector('.archive-date-btn');
            const prevBtn = root.querySelector('.archive-prev');
            const nextBtn = root.querySelector('.archive-next');
            capsule = root.querySelector('.archive-bottom');
            const backBtn = root.querySelector('.archive-back-btn');

            if (dateBtn) {
                dateBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleArrows();
                });
            }
            if (prevBtn) {
                prevBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    changeMonth(-1);
                });
            }
            if (nextBtn) {
                nextBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    changeMonth(1);
                });
            }
            if (backBtn) {
                backBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (onBack) onBack();
                });
            }

            // 点击外部收起箭头（仅在归档视图 DOM 范围内判断）
            document.addEventListener('click', onDocClick);
        }

        init();

        return function dispose() {
            document.removeEventListener('click', onDocClick);
        };
    }

    window.ArchiveView = { mountArchiveView };
})();
