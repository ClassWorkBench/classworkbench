// ============================================
// main/floating.js — 浮窗模式（画中画）
// 每个作业卡片 = 一个独立的无边框置顶 BrowserWindow。
// 卡片样式与主窗口完全一致（白底深色字 + 学科色整体追色）；
// 默认贴屏幕右侧竖排，超出屏幕高度自动加列；
// 拖动用系统级 -webkit-app-region（稳定，无手动 IPC 拖动）。
// 进入浮窗后自动隐藏主窗口，退出/全部关闭时自动显示主窗口。
// 事件通过 emit() 转发给主窗口渲染层。
// ============================================

/** 浮窗卡片布局常量 */
const WIN_PAD = 12;          // 透明边距（给 CSS 阴影留空间）
const CARD_W = 342;          // 卡片宽度 ≈ 主窗口 3 列卡片宽度
const WIN_W = CARD_W + WIN_PAD * 2;
const MARGIN = 12;
const GAP_X = 12;
const GAP_Y = 12;
const PROBE_W = 26;          // 贴边后露出的探头宽度（px）
const DOCK_ANIM_MS = 240;    // 贴边/滑出动画时长（ms）
const FADE_OUT_DELAY_MS = 3000; // 变成小探头后多久淡化（ms）
const PROBE_FINAL_H = 36;    // 贴边后探头最终高度（px，固定 36 与宽 PROBE_W=26 配出胶囊形）

// 贴边/展开缓动（双泳道：窗口矩形由本模块 setBounds 驱动，内容过渡由渲染层 CSS 驱动）
const EASE_IN_OUT_QUINT = (t) => (t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2); // 收起：先加速后急停（吸附感）
const EASE_OUT_QUINT = (t) => 1 - Math.pow(1 - t, 5); // 展开：先快后慢（弹出感）

/**
 * 工厂模式创建浮窗模块。
 * @param {object} opts
 * @param {object} opts.BrowserWindow - Electron BrowserWindow
 * @param {object} opts.screen        - Electron screen（多屏定位）
 * @param {object} opts.path          - Node path
 * @param {object} opts.log           - electron-log
 * @param {string} opts.assetsDir     - 资源根目录（floating.html / floating-preload.js）
 * @param {() => object | null} opts.getMainWindow - 获取主窗口（显示器匹配 / 隐藏）
 * @param {() => void} opts.showMainWindow - 显示主窗口（退出浮窗时恢复）
 * @param {() => boolean} opts.isQuitting - 应用是否正在退出（托盘退出等；退出时浮窗关闭不得恢复主界面）
 * @param {(event: string, data?: any) => void} opts.emit - 向主窗口渲染层发事件
 * @param {() => object} opts.getSettings - 读取主进程 settings（减弱动画开关 reduceAnimation）
 */
function createFloatingModule({ BrowserWindow, screen, path, log, assetsDir, getMainWindow, showMainWindow, isQuitting, emit, getSettings }) {

    /** @type {Map<string, {card: object, win: BrowserWindow, height: number, ready: boolean, x: number, y: number}>} */
    const entries = new Map();
    let modeActive = false;
    let lastOrder = [];       // 排序后的卡片 id 顺序（决定默认布局）
    let exiting = false;      // 防止 close 事件与主动关闭互踩
    let exitTimer = null;     // 退出兜底定时器
    let laidOut = false;      // 布局是否已执行（cardReady 迟到时据此修正窗口高度）

    function getPrimaryWorkArea() {
        const mainWin = getMainWindow && getMainWindow();
        try {
            const display = mainWin && !mainWin.isDestroyed()
                ? screen.getDisplayMatching(mainWin.getBounds())
                : screen.getPrimaryDisplay();
            return display.workArea;
        } catch (e) {
            return screen.getPrimaryDisplay().workArea;
        }
    }

    /** 浮窗自身所在显示器的工作区（dock / hover 热区用，F1：不绑定主窗口显示器） */
    function getEntryWorkArea(entry) {
        try {
            if (entry && entry.win && !entry.win.isDestroyed()) {
                return screen.getDisplayMatching(entry.win.getBounds()).workArea;
            }
        } catch (e) { /* 回退主屏 */ }
        return getPrimaryWorkArea();
    }

    function isActive() { return modeActive; }

    function getCount() { return entries.size; }

    /** 当前是否开启「减弱动画」（读主进程 settings.reduceAnimation，异常回退标准） */
    function isReducedMotion() {
        try { return !!(getSettings && getSettings().reduceAnimation); } catch (e) { return false; }
    }
    /** 减弱动画下的窗口矩形动画规格：时长减半、缓动换线性（去掉吸附/回弹的急停感） */
    function animSpec(normalMs, ease) {
        return isReducedMotion()
            ? { ms: Math.round(normalMs / 2), ease: (t) => t }
            : { ms: normalMs, ease };
    }

    function hideMainWindow() {
        try {
            const w = getMainWindow && getMainWindow();
            if (w && !w.isDestroyed()) w.hide();
        } catch (e) { log.warn('[floating] 隐藏主窗口失败:', e); }
    }

    function getCardForWebContents(wcId) {
        for (const [id, entry] of entries.entries()) {
            if (entry.win && !entry.win.isDestroyed() && entry.win.webContents.id === wcId) {
                return { card: entry.card, reduceAnimation: isReducedMotion() };
            }
        }
        return null;
    }

    function createWindow(card) {
        return new Promise((resolve, reject) => {
            const htmlPath = path.join(assetsDir, 'floating.html');
            const preloadPath = path.join(assetsDir, 'floating-preload.js');
            const win = new BrowserWindow({
                width: WIN_W,
                height: 180,
                x: 0,
                y: 0,
                frame: false,
                transparent: true,
                resizable: false,
                movable: true,
                alwaysOnTop: true,
                skipTaskbar: true,
                hasShadow: false,
                show: false,
                webPreferences: {
                    preload: preloadPath,
                    nodeIntegration: false,
                    contextIsolation: true,
                    sandbox: true,
                    spellcheck: false,
                    backgroundThrottling: false
                }
            });

            const entry = {
                card, win, height: 180, ready: false, x: 0, y: 0,
                dock: null, animating: false, animTimer: null
            };
            entries.set(card.id, entry);

            // 单卡 4s 加载超时 → reject（由 enter() 降级处理，不拖垮整批）
            const loadTimer = setTimeout(() => {
                log.error(`[floating] 卡片 ${card.id} 浮窗加载超时`);
                reject(new Error('浮窗加载超时'));
            }, 4000);

            const onFailLoad = (_e, code, desc, url) => {
                clearTimeout(loadTimer);
                log.error(`[floating] 加载失败 ${code} ${desc} ${url}`);
                reject(new Error(`浮窗加载失败 ${code}`));
            };
            win.webContents.once('did-fail-load', onFailLoad);
            win.webContents.once('did-finish-load', () => {
                clearTimeout(loadTimer);
                resolve();
            });

            // 系统级拖动后同步 entry.x/y（动画期间由 animateRect 写回，跳过）
            win.on('moved', () => {
                if (entry.animating) return;
                const b = win.getBounds();
                entry.x = b.x;
                entry.y = b.y;
            });

            // 用户意外关闭（Alt+F4 / 崩溃）→ 退出整个浮窗模式并恢复主窗口。
            // 用户预期：关掉任意一张浮窗，整个浮窗模式就收起来、主窗口恢复所有卡片。
            // 浮窗模式期间主窗口是隐藏的，若只处理这一张卡片，剩下浮窗继续挂着、
            // 主窗口仍隐藏，看起来就像"没反应"。
            win.on('closed', () => {
                // 应用正在退出（托盘退出）：窗口关闭是退出流程的一部分，不得触发"恢复主界面"
                if (isQuitting && isQuitting()) return;
                if (entries.has(card.id) && modeActive && !exiting) {
                    removeEntry(card.id);
                    exit();
                }
            });

            win.loadFile(htmlPath).catch((e) => {
                clearTimeout(loadTimer);
                reject(e);
            });
        });
    }

    /** 渲染层测量完内容高度后回调（布局由 enter() 执行一次；若已布局，则修正本窗高度） */
    function cardReady(wcId, height) {
        for (const [id, entry] of entries.entries()) {
            if (entry.win && !entry.win.isDestroyed() && entry.win.webContents.id === wcId) {
                const wa = getPrimaryWorkArea();
                const maxH = Math.max(120, Math.round(wa.height - MARGIN * 2 - WIN_PAD * 2));
                entry.height = Math.max(100, Math.min(Math.round(Number(height) || 180), maxH));
                entry.ready = true;
                // 测量迟到（布局已执行）→ 用真实高度修正窗口 bounds，避免以默认高度裁切内容
                if (laidOut) {
                    try {
                        const b = entry.win.getBounds();
                        entry.win.setBounds({ x: b.x, y: b.y, width: WIN_W, height: entry.height + WIN_PAD * 2 });
                    } catch (_) {}
                }
                return;
            }
        }
    }

    function allReady() {
        return lastOrder.every(id => {
            const e = entries.get(id);
            // 创建失败的卡片已被移除，视为就绪，不阻塞布局
            return !e || e.ready;
        });
    }

    /** 计算默认布局：右侧第一列，从上往下；超出底部 → 左侧加一列；x 有下界 clamp，卡片不会排到屏幕外 */
    function layoutAndShow() {
        const wa = getPrimaryWorkArea();
        const minX = wa.x + MARGIN;
        const maxX = wa.x + wa.width - MARGIN - WIN_W;
        let x = maxX;
        let y = wa.y + MARGIN;

        for (const id of lastOrder) {
            const entry = entries.get(id);
            if (!entry || entry.win.isDestroyed()) continue;
            const h = entry.height;
            if (y + h > wa.y + wa.height - MARGIN) {
                const nextX = x - (WIN_W + GAP_X);
                if (nextX >= minX) {
                    x = nextX;
                    y = wa.y + MARGIN;
                }
                // 已到屏幕左边界：保持当前列继续向下排（不重叠、不跑出屏幕，
                // 极端情况下最后几张会超出底部，但不至于丢失到屏幕外）
            }
            entry.x = Math.round(x);
            entry.y = Math.round(y);
            entry.win.setBounds({ x: entry.x, y: entry.y, width: WIN_W, height: h + WIN_PAD * 2 });
            entry.win.show();
            y += h + WIN_PAD * 2 + GAP_Y;
        }
        // 浮窗就绪后自动隐藏主窗口（画中画腾出屏幕）
        laidOut = true;
        hideMainWindow();
    }

    /** 强制同步清理：取消退出兜底、销毁全部残留浮窗、清空状态（进入新浮窗前调用，消除竞态） */
    function forceCleanup() {
        if (exitTimer) { clearTimeout(exitTimer); exitTimer = null; }
        exiting = true;
        for (const entry of entries.values()) {
            if (entry.animTimer) { clearInterval(entry.animTimer); entry.animTimer = null; }
            if (entry.dock && entry.dock.fadeTimer) { clearTimeout(entry.dock.fadeTimer); entry.dock.fadeTimer = null; }
            if (entry.win && !entry.win.isDestroyed()) entry.win.destroy();
        }
        exiting = false;
        entries.clear();
        lastOrder = [];
        laidOut = false;
        modeActive = false;
    }

    /** 进入浮窗模式：强制清理旧状态 → 创建全部浮窗（隐藏）→ 等高度测量 → 布局显示 */
    async function enter(cards) {
        forceCleanup();
        if (!Array.isArray(cards) || cards.length === 0) return { success: false, error: '没有可浮窗的卡片' };

        modeActive = true;
        // 先建 Map 索引再排序
        const byId = new Map(cards.map(c => [c.id, c]));
        lastOrder = cards
            .map(c => c.id)
            .sort((a, b) => {
                const ca = byId.get(a);
                const cb = byId.get(b);
                return (cb && cb.content ? cb.content.length : 0) - (ca && ca.content ? ca.content.length : 0);
            });

        const failed = [];
        try {
            // 逐卡创建，失败只移除该卡并让其回主窗口，不拖垮整批
            await Promise.all(cards.map(async card => {
                try {
                    await createWindow(card);
                } catch (e) {
                    log.error(`[floating] 卡片 ${card.id} 创建失败，回主窗口:`, e && e.message || e);
                    failed.push(card.id);
                    cleanupFailedCard(card.id);
                }
            }));

            if (entries.size === 0) {
                throw new Error('所有浮窗创建失败');
            }

            // 等渲染层测量高度（最多 3.5s，个别窗口异常时以默认高度布局，迟到测量由 cardReady 修正）
            const waitUntil = Date.now() + 3500;
            while (!allReady() && Date.now() < waitUntil) {
                await new Promise(r => setTimeout(r, 50));
            }
            // 布局只在此执行一次（cardReady 不再触发），避免"先默认后真实高度"的跳位
            layoutAndShow();
            return { success: true, count: entries.size, failed };
        } catch (e) {
            log.error('[floating] 启动失败:', e);
            forceCleanup();
            return { success: false, error: e.message || String(e), failed };
        }
    }

    /** 统一移除一个浮窗：停动画/停轮询 → 删 entries → 发事件 → 销毁窗口 */
    function removeEntry(id, { emitBack = false } = {}) {
        const entry = entries.get(id);
        if (!entry) return false;
        if (entry.animTimer) { clearInterval(entry.animTimer); entry.animTimer = null; }
        if (entry.dock && entry.dock.fadeTimer) { clearTimeout(entry.dock.fadeTimer); entry.dock.fadeTimer = null; }
        entries.delete(id);
        if (emitBack) emit('float:card-back', { id });
        if (entry.win && !entry.win.isDestroyed()) entry.win.destroy();
        return true;
    }

    /** 创建失败的卡片 → 移除浮窗，让卡片留在主窗口（不发 hidden，避免"凭空消失"） */
    function cleanupFailedCard(id) {
        removeEntry(id, { emitBack: true });
    }

    /** 浮窗渲染层播放完渐出动画后调用：销毁该窗口 */
    function closeAfterFade(wcId) {
        for (const [id, entry] of entries.entries()) {
            if (entry.win && !entry.win.isDestroyed() && entry.win.webContents.id === wcId) {
                removeEntry(id);
                return { success: true };
            }
        }
        return { success: false };
    }

    // ============ 贴边隐藏（dock） ============

    function send(entry, event, data) {
        try {
            if (entry.win && !entry.win.isDestroyed()) {
                entry.win.webContents.send(event, data);
            }
        } catch (_) {}
    }

    function findEntry(wcId) {
        for (const entry of entries.values()) {
            if (entry.win && !entry.win.isDestroyed() && entry.win.webContents.id === wcId) {
                return entry;
            }
        }
        return null;
    }

    /** 窗口矩形动画（x/y/宽/高，8ms 步进 + 时间戳插值 + 可注入 easing），结束后写回 entry.x/y */
    function animateRect(entry, from, to, duration, easing, onDone) {
        const win = entry.win;
        if (!win || win.isDestroyed()) { if (onDone) onDone(); return; }
        if (entry.animTimer) { clearInterval(entry.animTimer); entry.animTimer = null; }
        entry.animating = true;
        const start = Date.now();
        const d = {
            x: to.x - from.x,
            y: to.y - from.y,
            w: to.width - from.width,
            h: to.height - from.height
        };
        const ease = typeof easing === 'function' ? easing : (t) => 1 - Math.pow(1 - t, 3);
        entry.animTimer = setInterval(() => {
            if (win.isDestroyed()) {
                clearInterval(entry.animTimer);
                entry.animTimer = null;
                entry.animating = false;
                if (onDone) onDone();
                return;
            }
            const t = Math.min(1, (Date.now() - start) / duration);
            const e = ease(t);
            win.setBounds({
                x: Math.round(from.x + d.x * e),
                y: Math.round(from.y + d.y * e),
                width: Math.round(from.width + d.w * e),
                height: Math.round(from.height + d.h * e)
            });
            if (t >= 1) {
                clearInterval(entry.animTimer);
                entry.animTimer = null;
                entry.animating = false;
                entry.x = to.x;
                entry.y = to.y;
                if (onDone) onDone();
            }
        }, 8);
    }

    /**
     * 贴边隐藏：窗口直接快速缩成小探头（固定高度 PROBE_FINAL_H，不随卡片大小变化）
     * 变成小探头后，3 秒淡化探头本身（半透明，鼠标悬停恢复）
     * 已贴边则滑出。
     */
    function dockCard(wcId) {
        const entry = findEntry(wcId);
        if (!entry) return { success: false };
        if (entry.dock) { undockEntry(entry); return { success: true }; }

        const wa = getEntryWorkArea(entry);
        const b = entry.win.getBounds();
        const centerX = b.x + b.width / 2;
        const side = centerX < (wa.x + wa.width / 2) ? 'left' : 'right';
        const winH = b.height || (entry.height + WIN_PAD * 2);
        const dockW = PROBE_W + WIN_PAD * 2;
        const dockX = side === 'left' ? wa.x : wa.x + wa.width - dockW;
        const dockY = Math.min(Math.max(b.y + (winH - PROBE_FINAL_H) / 2, wa.y), wa.y + wa.height - PROBE_FINAL_H);
        const from = { x: b.x, y: b.y, width: b.width, height: winH };
        const toProbe = { x: dockX, y: Math.round(dockY), width: dockW, height: PROBE_FINAL_H };

        entry.dock = {
            side, from, dockX, dockY, dockW,
            fadeTimer: null, faded: false, phase: 'docking'
        };

        // 双泳道收起：先发 probe 让渲染层把卡片缩成彩条（CSS transition，GPU 合成），
        // 60ms 后窗口矩形再跟上（native setBounds），缩放过程盖住内容收缩，视觉连贯
        send(entry, 'float:probe', { side, color: entry.card.color || '#5b6abf' });
        const spec = animSpec(DOCK_ANIM_MS, EASE_IN_OUT_QUINT);
        setTimeout(() => {
            if (!entry.dock || entry.win.isDestroyed()) return;
            const cur = entry.win.getBounds();
            animateRect(entry,
                { x: cur.x, y: cur.y, width: cur.width, height: cur.height },
                toProbe, spec.ms, spec.ease, () => {
                    if (!entry.dock || entry.win.isDestroyed()) return;
                    entry.dock.phase = 'probe';
                    // 变成小探头后，3 秒淡化
                    entry.dock.fadeTimer = setTimeout(() => {
                        if (!entry.dock || entry.win.isDestroyed() || !modeActive) return;
                        entry.dock.faded = true;
                        send(entry, 'float:probe-fade');
                    }, FADE_OUT_DELAY_MS);
                });
        }, 60);
        return { success: true };
    }

    /** 取消淡化：清除淡化定时器，恢复不透明 */
    function unfadeCard(wcId) {
        const entry = findEntry(wcId);
        if (!entry || !entry.dock) return { success: false };
        if (entry.dock.fadeTimer) { clearTimeout(entry.dock.fadeTimer); entry.dock.fadeTimer = null; }
        if (!entry.dock.faded) return { success: true };
        entry.dock.faded = false;
        send(entry, 'float:probe-unfade');
        return { success: true };
    }

    /** 重新计时淡化：鼠标离开探头后，3 秒后再次淡化 */
    function refadeCard(wcId) {
        const entry = findEntry(wcId);
        if (!entry || !entry.dock) return { success: false };
        if (entry.dock.fadeTimer) clearTimeout(entry.dock.fadeTimer);
        entry.dock.fadeTimer = setTimeout(() => {
            if (!entry.dock || entry.win.isDestroyed() || !modeActive) return;
            entry.dock.faded = true;
            send(entry, 'float:probe-fade');
        }, FADE_OUT_DELAY_MS);
        return { success: true };
    }

    /** 滑出：窗口矩形先展开（内容保持彩条态），到位后通知渲染层把彩条弹出成卡片（双泳道） */
    function undockEntry(entry) {
        const d = entry.dock;
        if (!d) return;
        if (d.fadeTimer) { clearTimeout(d.fadeTimer); d.fadeTimer = null; }
        if (entry.animTimer) { clearInterval(entry.animTimer); entry.animTimer = null; }
        entry.animating = false;
        const b = entry.win.getBounds();
        entry.dock = null;
        const spec = animSpec(DOCK_ANIM_MS, EASE_OUT_QUINT);
        animateRect(entry, { x: b.x, y: b.y, width: b.width, height: b.height }, d.from, spec.ms, spec.ease, () => {
            if (entry.win.isDestroyed()) return;
            send(entry, 'float:probe-off');
        });
    }

    function undockCard(wcId) {
        const entry = findEntry(wcId);
        if (!entry || !entry.dock) return { success: false };
        undockEntry(entry);
        return { success: true };
    }

    /** 退出浮窗模式：显示主窗口 → 浮窗渐出 → 销毁（带兜底定时器）。幂等：重复调用不重复发指令 */
    function exit() {
        // 已彻底退出（无状态）→ 直接返回
        if (!modeActive && entries.size === 0) return { success: true };
        // 已在优雅退出流程中（modeActive=false 但残留窗口在渐出/待销毁）→ 不重复发 fade-out
        if (!modeActive) return { success: true };
        // 应用正在退出（托盘退出等）：直接清理浮窗，不要显示主窗口、不要播渐出动画
        if (isQuitting && isQuitting()) {
            forceCleanup();
            return { success: true };
        }
        modeActive = false;

        // 先恢复主窗口（浮窗渐出的同时主窗口卡片渐入）
        try {
            if (typeof showMainWindow === 'function') showMainWindow();
            else {
                const w = getMainWindow && getMainWindow();
                if (w && !w.isDestroyed()) { w.show(); w.focus(); }
            }
        } catch (e) { log.warn('[floating] 显示主窗口失败:', e); }

        // 通知所有浮窗播放渐出动画
        for (const entry of entries.values()) {
            try {
                if (entry.win && !entry.win.isDestroyed()) {
                    entry.win.webContents.send('float:fade-out');
                }
            } catch (_) {}
        }

        // 兜底：无论浮窗是否正常渐出，700ms 后强制销毁并通知渲染层
        if (exitTimer) clearTimeout(exitTimer);
        exitTimer = setTimeout(() => {
            exitTimer = null;
            forceCleanup();
            emit('float:exited');
        }, 700);
        return { success: true };
    }

    return {
        enter,
        exit,
        cardReady,
        getCardForWebContents,
        closeAfterFade,
        dockCard,
        undockCard,
        unfadeCard,
        refadeCard,
        isActive,
        getCount
    };
}

module.exports = { createFloatingModule };
