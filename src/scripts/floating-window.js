// ============================================
// floating-window.js — 浮窗窗口渲染层
// 卡片直接复用主窗口 .homework-card 样式；
// 此处仅填充内容、设置学科色变量、驱动高度测量与拖拽交互。
// 整卡系统级拖动（-webkit-app-region: drag）；
// 右上角 ⋯ 按钮弹出操作：贴边 / 关闭此浮窗 / 退出浮窗模式。
// ============================================

(function () {
    'use strict';

    const api = window.floatingAPI;

    // 编号美化（与主窗口 formatNumCircle 一致，浮窗窗口不加载主窗口脚本）
    function formatNumCircle(text) {
        return String(text || '').split('\n').map(line => {
            const m = line.match(/^(\d+)[.、．]\s*/);
            if (m) {
                const num = m[1];
                const rest = line.substring(m[0].length);
                return `<span class="num-circle">${num}</span> ${escapeHtml(rest)}`;
            }
            return escapeHtml(line);
        }).join('<br>');
    }

    // 不美化编号时的纯转义渲染
    function escapeHtmlLines(text) {
        return String(text || '').split('\n').map(line => escapeHtml(line)).join('<br>');
    }

    function escapeHtml(s) {
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    // 学科色 hex → rgb（用于整卡追色 --card-tint）
    function hexToRgb(hex) {
        const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
        return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null;
    }

    async function init() {
        let cardData = null;
        try {
            cardData = await api.init();
        } catch (e) {
            cardData = null;
        }
        if (!cardData || !cardData.card) {
            document.body.innerHTML = '<div class="float-error">浮窗数据加载失败</div>';
            return;
        }
        // 主进程 settings 里的减弱动画开关：挂在 body class 上，floating.css 据此只留柔和淡入淡出
        if (cardData.reduceAnimation) document.body.classList.add('reduce-anim');

        const card = cardData.card;
        const cardEl = document.getElementById('floatCard');
        const subjectEl = document.getElementById('floatSubject');
        const contentEl = document.getElementById('floatContent');

        // 学科色变量：直接驱动 .homework-card 样式
        cardEl.style.setProperty('--subject-accent', card.color || '#5b6abf');
        const rgb = hexToRgb(card.color || '#5b6abf');
        if (rgb) cardEl.style.setProperty('--card-tint', `rgba(${rgb.r},${rgb.g},${rgb.b},0.30)`);
        document.documentElement.style.setProperty('--font-size-content', (card.fontSize || 26) + 'px');

        subjectEl.innerHTML = `<span class="subject-dot"></span>${escapeHtml(card.subjectName || '作业')}`;
        contentEl.innerHTML = (card.beautifyNumber === false)
            ? escapeHtmlLines(card.content)
            : formatNumCircle(card.content);

        bindMenu(cardEl);

        // 测量自然高度 → 通知主进程布局
        // 窗口尚未显示（show:false），requestAnimationFrame 不调度，用 setTimeout。
        // +4px 缓冲抵消亚像素取整，避免差 1px 触发滚动条。
        setTimeout(() => {
            const inner = document.getElementById('floatCardInner');
            const saved = {
                overflow: cardEl.style.overflow,
                innerOverflow: inner ? inner.style.overflowY : '',
                innerFlex: inner ? inner.style.flex : ''
            };
            cardEl.style.overflow = 'visible';
            if (inner) { inner.style.overflowY = 'visible'; inner.style.flex = '0 0 auto'; }

            const raw = cardEl.offsetHeight;
            const h = (raw > 0 ? Math.ceil(raw) : 160) + 4;

            cardEl.style.overflow = saved.overflow;
            if (inner) { inner.style.overflowY = saved.innerOverflow; inner.style.flex = saved.innerFlex; }

            api.ready(h);
        }, 60);

        // 退出浮窗模式：播放渐出动画后通知主进程销毁
        if (api.onFadeOut) {
            api.onFadeOut(() => {
                document.body.classList.add('fade-out');
                setTimeout(() => {
                    if (api.closeAfterFade) api.closeAfterFade();
                }, 320);
            });
        }

        // 贴边隐藏：进入/退出探头模式
        if (api.onProbe) {
            api.onProbe(({ side, color } = {}) => bindProbe(side || 'right', color));
        }
        if (api.onProbeOff) {
            api.onProbeOff(() => unbindProbe());
        }

        // 探头淡化：变成小探头后 3 秒，探头半透明
        if (api.onProbeFade) {
            api.onProbeFade(() => {
                const probeEl = document.getElementById('floatProbe');
                if (probeEl) probeEl.classList.add('probe-faded');
            });
        }
        // 取消淡化：恢复不透明
        if (api.onProbeUnfade) {
            api.onProbeUnfade(() => {
                const probeEl = document.getElementById('floatProbe');
                if (probeEl) probeEl.classList.remove('probe-faded');
            });
        }
    }

    function bindMenu(cardEl) {
        const actionsEl = document.getElementById('floatActions');
        const actionsRow = document.getElementById('floatActionsRow');
        const ctrlBtn = document.getElementById('floatCtrl');
        const dockBtn = document.getElementById('fDockBtn');
        const exitAllBtn = document.getElementById('fExitAllBtn');

        // 收起兜底：等 transition 结束再 display:none。
        // 反复打开/关闭时若上一次的 hideTimer 还在排队，先取消，避免提前隐藏新打开的菜单。
        let hideTimer = null;
        const ACTION_TRANSITION_MS = 340;  // 320ms 最长 transition + 20ms 余量

        // 展开操作组：display:flex → 强制 reflow → 下一帧加 .shown 触发 opacity/transform transition
        const openActions = () => {
            if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
            // 已完全展开，无需重复
            if (actionsEl.classList.contains('shown')) return;

            // 已 display:flex（关闭过程中 hideTimer 排队 / 展开过程中 raf 待执行）：
            // 直接同步加 .shown 即可触发 transition（display 已经在，无需再 raf）
            if (actionsEl.classList.contains('open')) {
                actionsEl.classList.add('shown');
                ctrlBtn.classList.add('open');
                ctrlBtn.setAttribute('aria-expanded', 'true');
                return;
            }

            // 完全未打开：display:flex → 强制 reflow → 下一帧加 .shown
            // 必须用 raf，否则浏览器把 display 切换和 .shown 视为同一帧，transition 不触发
            actionsEl.classList.add('open');
            void actionsRow.offsetHeight;
            requestAnimationFrame(() => {
                actionsEl.classList.add('shown');
                ctrlBtn.classList.add('open');
                ctrlBtn.setAttribute('aria-expanded', 'true');
            });
        };

        // 收起操作组：移除 .shown 触发收起 transition，等动画结束再 display:none
        const closeActions = () => {
            if (!actionsEl.classList.contains('open')) return;
            actionsEl.classList.remove('shown');
            ctrlBtn.classList.remove('open');
            ctrlBtn.setAttribute('aria-expanded', 'false');
            if (hideTimer) clearTimeout(hideTimer);
            hideTimer = setTimeout(() => {
                hideTimer = null;
                // 收起期间又被打开则不要隐藏
                if (!actionsEl.classList.contains('shown')) {
                    actionsEl.classList.remove('open');
                }
            }, ACTION_TRANSITION_MS);
        };

        const toggle = (e) => {
            e.stopPropagation();
            // 用 .shown 判断"是否已展开完成"。展开过程中再次点击 → 收起；
            // 收起过程中再次点击 → 重新展开（先取消 hideTimer，再加 .shown）
            if (actionsEl.classList.contains('shown')) {
                closeActions();
            } else {
                openActions();
            }
        };

        ctrlBtn.addEventListener('click', toggle);
        // 点击菜单外任意处收起
        document.addEventListener('click', (e) => {
            if (actionsEl.classList.contains('shown') && !actionsEl.contains(e.target)) {
                closeActions();
            }
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && actionsEl.classList.contains('shown')) closeActions();
        });

        dockBtn.addEventListener('click', (e) => { e.stopPropagation(); closeActions(); api.dock(); });
        exitAllBtn.addEventListener('click', (e) => { e.stopPropagation(); closeActions(); api.exitAll(); });

        // 双击卡片 = 贴边隐藏（drag 区域的 DOM 事件仍会派发）
        cardEl.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            if (actionsEl.classList.contains('shown')) closeActions();
            api.dock();
        });
    }

    // ============ 贴边探头模式 ============
    const PROBE_SHRINK_MS = 200;  // 收起双泳道：卡片缩成彩条的过渡时长（CSS transition，可中断/反向）
    let probeTimer = null;        // 收缩动画结束 → 切入探头模式的延迟定时器
    let probeSeq = 0;             // 递增 token：快速往返时让旧定时器/旧动画回调全部失效

    function clearProbeTimers() {
        if (probeTimer) { clearTimeout(probeTimer); probeTimer = null; }
    }

    function bindProbe(side, color) {
        const bodyEl = document.body;
        const probeEl = document.getElementById('floatProbe');
        const cardEl = document.getElementById('floatCard');
        if (!probeEl || !cardEl) return;
        const seq = ++probeSeq;

        // 方向箭头：贴左半屏 → 右箭头 ›（指示向右展开）；贴右半屏 → 左箭头 ‹（指示向左展开）
        bodyEl.classList.remove('probe-left', 'probe-right');
        bodyEl.classList.add(side === 'left' ? 'probe-left' : 'probe-right');
        probeEl.style.background = color || '#5b6abf';
        probeEl.textContent = side === 'left' ? '›' : '‹';
        // 点击逻辑：已淡化 → 恢复不透明（显示实心彩条）；未淡化 → 完全展开成完整卡片
        probeEl.onclick = () => {
            if (probeEl.classList.contains('probe-faded')) {
                api.unfade();
            } else {
                api.undock();
            }
        };
        // 鼠标移入探头：取消淡化显示实心彩条；移出后重新计时 3 秒淡化。
        // 用 pointerenter/leave + pointerType 过滤：触屏点击不触发（保留两次点击语义）
        probeEl.onpointerenter = (e) => {
            if (e.pointerType === 'mouse') api.unfade();
        };
        probeEl.onpointerleave = (e) => {
            if (e.pointerType === 'mouse') api.refade();
        };

        // 收起双泳道：卡片先缩成彩条（transform scale + 学科实色 + 胶囊圆角），
        // 动画结束后切入探头模式（窗口矩形动画由主进程并行驱动）
        clearProbeTimers();
        cardEl.classList.add('probe-shrink');
        probeTimer = setTimeout(() => {
            probeTimer = null;
            if (seq !== probeSeq) return;
            bodyEl.classList.add('probe-mode');
            cardEl.classList.remove('probe-shrink');
        }, PROBE_SHRINK_MS);
    }

    // 兜底：强制刷新 -webkit-app-region drag 区域注册。
    // Chromium 在 display/visibility 切换 + transform transition 竞态下偶尔会丢失 drag 注册，
    // 表现为卡片看起来还在但系统不认它可拖。临时切到 no-drag 下一帧再切回 drag，
    // 迫使 Chromium 重新扫描可拖动区域。
    function refreshDragRegion(cardEl) {
        if (!cardEl) return;
        cardEl.style.setProperty('-webkit-app-region', 'no-drag', 'important');
        requestAnimationFrame(() => {
            cardEl.style.removeProperty('-webkit-app-region');
        });
    }

    function unbindProbe() {
        const bodyEl = document.body;
        const probeEl = document.getElementById('floatProbe');
        const cardEl = document.getElementById('floatCard');
        if (probeEl) {
            probeEl.onclick = null;
            probeEl.onpointerenter = null;
            probeEl.onpointerleave = null;
        }
        const seq = ++probeSeq;
        clearProbeTimers();

        const wasInProbe = bodyEl.classList.contains('probe-mode');
        if (wasInProbe && cardEl) {
            // 展开双泳道：保持收缩态显示 → 加 spring 过渡类 → 下一帧移除收缩 → 彩条弹出成卡片。
            // probe-left/right 延迟移除，保证展开期间 transform-origin 仍指向贴边侧
            cardEl.classList.add('probe-shrink', 'probe-grow');
            bodyEl.classList.remove('probe-mode');
            requestAnimationFrame(() => requestAnimationFrame(() => {
                if (seq !== probeSeq) return;
                cardEl.classList.remove('probe-shrink');
                setTimeout(() => {
                    cardEl.classList.remove('probe-grow');
                    if (!bodyEl.classList.contains('probe-mode')) {
                        bodyEl.classList.remove('probe-left', 'probe-right');
                    }
                    // ★ 展开动画结束后强制刷新 drag 区域注册（兜底防失效）
                    refreshDragRegion(cardEl);
                }, 320);
            }));
        } else {
            // 收缩动画进行中被反调（快速往返）：transition 反向平滑恢复，不切探头模式
            if (cardEl) cardEl.classList.remove('probe-shrink', 'probe-grow');
            bodyEl.classList.remove('probe-mode', 'probe-left', 'probe-right');
            // 即使是快速反调，也刷新一次 drag 注册，避免竞态残留
            refreshDragRegion(cardEl);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
