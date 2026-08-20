// ============================================
// styling.js
// 启动/设置变更时应用样式：字号、accent RGB、背景层底色
// ============================================

(function () {
    const state = window.AppState;
    const { hexToRgb } = window.AppUtils;

    function applyStyling() {
        const settings = state.settings;
        const bgLayer = state.dom.bgLayer();

        // 注意：不要清空 document.body.className —— 模糊开关(blur-*-off)、
        // 减弱动画(reduce-anim)、截图(capturing)等运行时状态都挂在 body class 上，
        // 清空会导致这些状态丢失、CSS 回退到默认值（例如关闭的模糊被"强制打开"）。
        document.documentElement.style.setProperty('--font-size-content', settings.contentFontSize + 'px');

        const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
        if (accent) {
            const rgb = hexToRgb(accent);
            if (rgb) {
                document.documentElement.style.setProperty('--accent-rgb', `${rgb.r},${rgb.g},${rgb.b}`);
            }
        }
        if (bgLayer) {
            bgLayer.style.backgroundColor = getComputedStyle(document.documentElement).getPropertyValue('--bg-body').trim() || '#fafaf7';
        }
    }

    // 系统「减弱动态效果」媒体查询对象；change 事件里实时同步 body.reduce-anim
    let reducedMotionMedia = null;

    // 统一入口：只要"系统开了减动效"或"软件里手动开了减动效"，就切成温和动画。
    function applyReducedMotion() {
        const systemReduced = reducedMotionMedia ? reducedMotionMedia.matches : false;
        const shouldReduce = !!state.settings.reduceAnimation || systemReduced;
        document.body.classList.toggle('reduce-anim', shouldReduce);
    }

    function initStyling() {
        applyStyling();
        // 绑定系统减动效：声明（更改时自动适配），一次性,无副作用
        if (typeof window.matchMedia === 'function') {
            reducedMotionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
            const onChange = () => { try { applyReducedMotion(); } catch (_) {} };
            if (reducedMotionMedia.addEventListener) {
                reducedMotionMedia.addEventListener('change', onChange);
            } else if (reducedMotionMedia.addListener) {
                reducedMotionMedia.addListener(onChange);
            }
        }
        applyReducedMotion();
    }

    window.AppStyling = { applyStyling, applyReducedMotion, initStyling };
})();
