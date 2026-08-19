// ============================================
// modal.js
// 通用模态框（提供 showModal）
// ============================================

(function () {
    const state = window.AppState;

    function showModal(html, onClose, options = {}) {
        const { replace = true } = options;
        const overlay = document.createElement('div');
        overlay.className = 'overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        const dialog = document.createElement('div');
        dialog.className = 'dialog';
        dialog.innerHTML = html;
        overlay.appendChild(dialog);
        const root = state.dom.modalRoot();
        if (replace) {
            root.innerHTML = '';
        }
        root.appendChild(overlay);
        // 标记 body 进入模态态：卡片激活态监听器据此跳过"点击外部关闭"逻辑，
        // 避免未来 z-index 调整后出现穿透误触发
        document.body.classList.add('modal-open');

        const focusable = dialog.querySelector('button, input, textarea, select');
        if (focusable) setTimeout(() => focusable.focus(), 50);

        let closing = false;
        const close = () => {
            // 多个关闭入口（遮罩点击 / Esc / 按钮）可能并发，加守卫避免动画重播
            if (closing) return;
            closing = true;
            // dialog 自身回缩下沉，与打开时的 dialogPop 形成对称的进退场
            dialog.classList.add('closing');
            overlay.style.opacity = '0';
            overlay.style.transition = 'opacity 0.25s ease';
            setTimeout(() => {
                if (overlay.parentNode) overlay.remove();
                // 仅当所有 overlay 都关闭后才移除 .modal-open，支持嵌套弹窗（如清空确认）
                if (!root.querySelector('.overlay')) {
                    document.body.classList.remove('modal-open');
                }
                if (onClose) onClose();
            }, 250);
        };
        // 仅当 mousedown 与 mouseup 均直接发生在 overlay 本身时才视为“点击外部”关闭。
        // 不能用 click：其 e.target 是 mousedown/mouseup 的最近共同祖先，
        // 从 dialog 内按住拖到 overlay 上释放会被误判为点击外部。
        let mouseDownOnOverlay = false;
        overlay.addEventListener('mousedown', e => {
            mouseDownOnOverlay = (e.target === overlay);
        });
        overlay.addEventListener('mouseup', e => {
            if (mouseDownOnOverlay && e.target === overlay) close();
            mouseDownOnOverlay = false;
        });
        overlay.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') close();
        });
        return { overlay, dialog, close };
    }

    window.AppModal = { showModal };
})();
