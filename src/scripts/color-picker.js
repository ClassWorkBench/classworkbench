// ============================================
// color-picker.js — 自定义多色系颜色选择器
// 内置 5 套色系：经典 / 莫兰迪 / 马卡龙 / 国风 / 自然
// 选项卡切换 + 色块网格 + 弹出层
// ============================================

window.ColorPicker = (function () {

    // ===== 内置色系 =====
    const PALETTES = [
        {
            name: '经典',
            colors: [
                '#d97a6a', '#6a7ad9', '#4ab8b8', '#4a8ad9',
                '#d97aaa', '#4ab87a', '#d9a84a', '#8a7ad9',
                '#5b6abf', '#d45a5a', '#e8a87c', '#7a9ad9',
            ]
        },
        {
            name: '莫兰迪',
            colors: [
                '#9a8c98', '#c9ada7', '#a8a0a0', '#b8a280',
                '#8ba3a9', '#a0b0a0', '#c4a882', '#9e7b8a',
                '#7a90a4', '#867ba1', '#a89bb0', '#93928e',
            ]
        },
        {
            name: '马卡龙',
            colors: [
                '#ffb5a7', '#fcd5ce', '#fec5bb', '#f9dcc4',
                '#e8dff5', '#d8bbff', '#c8b6ff', '#b8c0ff',
                '#bbd0ff', '#a2d2ff', '#bde0fe', '#b6f0c4',
            ]
        },
        {
            name: '国风',
            colors: [
                '#e54d42', '#f47983', '#d93a49', '#ef5b9c',
                '#8d4bbb', '#694d9f', '#426666', '#5c7a29',
                '#ed1941', '#c93756', '#2b4a5a', '#508a50',
            ]
        },
        {
            name: '自然',
            colors: [
                '#6b8e23', '#556b2f', '#8fbc8f', '#3cb371',
                '#2e8b57', '#228b22', '#808000', '#b8860b',
                '#cd853f', '#d2691e', '#8b4513', '#a0522d',
            ]
        }
    ];

    let activeTab = 0;      // 当前选中的色系索引
    let currentColor = '';   // 当前选中颜色
    let popover = null;      // 弹出层 DOM
    let onPickCallback = null;

    /** 创建弹出层 DOM */
    function createPopover() {
        const el = document.createElement('div');
        el.className = 'color-picker-popover';
        el.innerHTML = `
            <div class="cp-tabs">
                ${PALETTES.map((p, i) =>
                    `<button class="cp-tab${i === activeTab ? ' active' : ''}" data-idx="${i}">${p.name}</button>`
                ).join('')}
            </div>
            <div class="cp-grid"></div>
        `;

        // 选项卡切换
        el.querySelectorAll('.cp-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                activeTab = parseInt(tab.dataset.idx);
                el.querySelectorAll('.cp-tab').forEach((t, i) => {
                    t.classList.toggle('active', i === activeTab);
                });
                renderGrid(el);
            });
        });

        renderGrid(el);
        return el;
    }

    /** 渲染当前色系的色块网格 */
    function renderGrid(popoverEl) {
        const grid = popoverEl.querySelector('.cp-grid');
        const palette = PALETTES[activeTab];
        grid.innerHTML = palette.colors.map(c => `
            <button class="cp-swatch${c.toLowerCase() === currentColor.toLowerCase() ? ' selected' : ''}"
                    style="background:${c}"
                    data-color="${c}"
                    title="${c}"
                    aria-label="选择颜色 ${c}"></button>
        `).join('');

        grid.querySelectorAll('.cp-swatch').forEach(sw => {
            sw.addEventListener('click', () => {
                const color = sw.dataset.color;
                currentColor = color;
                if (onPickCallback) onPickCallback(color);
                closePopover();
            });
        });
    }

    /** 定位弹出层到触发按钮下方 */
    function positionPopover(triggerBtn) {
        if (!popover) return;
        const rect = triggerBtn.getBoundingClientRect();
        const popoverRect = popover.getBoundingClientRect();
        let left = rect.left;
        let top = rect.bottom + 6;

        // 防止超出右边界
        if (left + popoverRect.width > window.innerWidth - 8) {
            left = window.innerWidth - popoverRect.width - 8;
        }
        // 防止超出下边界
        if (top + popoverRect.height > window.innerHeight - 8) {
            top = rect.top - popoverRect.height - 6;
        }

        popover.style.left = left + 'px';
        popover.style.top = top + 'px';
    }

    function openPopover(triggerBtn) {
        if (popover) closePopover();
        popover = createPopover();
        document.body.appendChild(popover);
        positionPopover(triggerBtn);

        // 下一帧定位（等 DOM 渲染后才能拿到准确尺寸）
        requestAnimationFrame(() => positionPopover(triggerBtn));

        // 点击外部关闭
        setTimeout(() => {
            document.addEventListener('click', onOutsideClick, true);
        }, 0);
    }

    function closePopover() {
        if (popover) {
            popover.remove();
            popover = null;
        }
        document.removeEventListener('click', onOutsideClick, true);
    }

    function onOutsideClick(e) {
        if (popover && !popover.contains(e.target) && !e.target.classList.contains('color-swatch-btn')) {
            closePopover();
        }
    }

    /**
     * 初始化颜色选择器
     * @param {HTMLElement} triggerBtn - 触发按钮（色块）
     * @param {string} initialColor - 初始颜色
     * @param {Function} onPick - 选中颜色回调
     */
    function init(triggerBtn, initialColor, onPick) {
        currentColor = initialColor;
        onPickCallback = onPick;
        triggerBtn.style.background = initialColor;

        triggerBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (popover) {
                closePopover();
            } else {
                openPopover(triggerBtn);
            }
        });
    }

    return { init, close: closePopover };
})();
