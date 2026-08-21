// ============================================
// settings/about.js — 关于面板
// 导航最底"关于"项：应用名片 / 版本号 / 开源协议 / 法律文档入口
// ============================================

window.SettingsModules = window.SettingsModules || {};

// 文档链接用的自定义线框图标（来自 D:/Downloads，描边改为 currentColor 跟随主题蓝）
// 顺序：agreement 协议 / privacy 隐私 / security 保护
const DOC_ICONS = {
    agreement: '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="8" y="4" width="32" height="40" rx="2" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 4H25V20L20.5 16L16 20V4Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 28H26" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M16 34H32" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
    privacy: '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="24" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 41C4 32.1634 12.0589 25 22 25" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><rect x="27" y="31" width="14" height="10" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M37 31V28C37 26.3431 35.6569 25 34 25C32.3431 25 31 26.3431 31 28V31" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    security: '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 9.25564L24.0086 4L42 9.25564V20.0337C42 31.3622 34.7502 41.4194 24.0026 45.0005C13.2521 41.4195 6 31.36 6 20.0287V9.25564Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M15 23L22 30L34 18" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    opensource: '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M24.0004 11.619C26.0933 11.619 27.7899 9.91347 27.7899 7.80952C27.7899 5.70558 26.0933 4 24.0004 4C21.9075 4 20.2109 5.70558 20.2109 7.80952C20.2109 9.91347 21.9075 11.619 24.0004 11.619Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M9.78947 40.1906C11.8823 40.1906 13.5789 38.485 13.5789 36.3811C13.5789 34.2771 11.8823 32.5715 9.78947 32.5715C7.69661 32.5715 6 34.2771 6 36.3811C6 38.485 7.69661 40.1906 9.78947 40.1906Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M38.2104 40.1906C40.3032 40.1906 41.9998 38.485 41.9998 36.3811C41.9998 34.2771 40.3032 32.5715 38.2104 32.5715C36.1175 32.5715 34.4209 34.2771 34.4209 36.3811C34.4209 38.485 36.1175 40.1906 38.2104 40.1906Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M33.1426 10.3142C38.444 13.4629 41.9999 19.2664 41.9999 25.9048C41.9999 26.4816 41.9731 27.0522 41.9206 27.6152V27.6152" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M31.014 42.575C28.8585 43.4926 26.4883 44.0001 24.0001 44.0001C21.512 44.0001 19.1418 43.4926 16.9863 42.575" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M6.07936 27.6152C6.02685 27.0522 6 26.4816 6 25.9048C6 19.2664 9.5559 13.4629 14.8573 10.3142" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    contact: '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M36 32C40.4183 32 44 28.4183 44 24C44 19.5817 40.4183 16 36 16" fill="none"/><path d="M36 32C40.4183 32 44 28.4183 44 24C44 19.5817 40.4183 16 36 16" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M12 16C7.58172 16 4 19.5817 4 24C4 28.4183 7.58172 32 12 32" fill="none"/><path d="M12 16C7.58172 16 4 19.5817 4 24C4 28.4183 7.58172 32 12 32" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M12 32V24V16C12 9.37258 17.3726 4 24 4C30.6274 4 36 9.37258 36 16V32C36 38.6274 30.6274 44 24 44" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};

window.SettingsModules.about = {
    render(ctx) {
        const { escapeHtml } = ctx;
        const docVer = (window.AppConfig && window.AppConfig.AGREEMENT_VERSION) || '—';
        return `
                    <!-- 面板：关于 -->
                    <div class="settings-panel" id="panel-about">
                        <div class="panel-header">
                            <h3>关于班级工作台</h3>
                            <p class="panel-desc">版本信息、开源协议与法律文档</p>
                        </div>
                        <div class="panel-body">
                            <div class="about-hero">
                                <div class="about-logo">${emoji('🏫')}</div>
                                <div class="about-name">
                                    <h2>班级工作台</h2>
                                    <p>ClassWorkBench · 班级作业与晚修管理桌面工具</p>
                                </div>
                            </div>

                            <div class="about-meta">
                                <div class="about-meta-row"><span>版本</span><b id="aboutVersion">加载中…</b></div>
                                <div class="about-meta-row"><span>协议文档版本</span><b id="aboutDocVersion">${escapeHtml(docVer)}</b></div>
                            </div>

                            <div class="setting-group">
                                <label>文档与联系</label>
                                <div class="about-doc-links">
                                    <button class="about-doc-link" type="button" data-doc="agreement"><span class="doc-ico">${DOC_ICONS.agreement}</span>用户协议</button>
                                    <button class="about-doc-link" type="button" data-doc="privacy"><span class="doc-ico">${DOC_ICONS.privacy}</span>隐私声明</button>
                                    <button class="about-doc-link" type="button" data-doc="security"><span class="doc-ico">${DOC_ICONS.security}</span>数据的安全性</button>
                                    <button class="about-doc-link" type="button" data-doc="opensource"><span class="doc-ico">${DOC_ICONS.opensource}</span>开源软件声明</button>
                                    <button class="about-doc-link" type="button" data-doc="contact"><span class="doc-ico">${DOC_ICONS.contact}</span>联系我们</button>
                                </div>
                            </div>
                        </div>
                    </div>
        `;
    },

    bind(ctx) {
        const { api, escapeHtml, toast } = ctx;
        const { showModal } = window.AppModal;
        const panel = document.getElementById('panel-about');
        if (!panel) return;

        // ---- 版本号：优先取主进程包版本，失败回退配置 ----
        const verEl = panel.querySelector('#aboutVersion');
        (async () => {
            try {
                const res = await api.getVersion();
                if (res && res.success && res.version) {
                    verEl.textContent = res.version;
                    return;
                }
            } catch (e) {
                console.error('读取版本号失败:', e);
            }
            verEl.textContent = (window.AppConfig && window.AppConfig.APP_VERSION) || '1.0.0';
        })();

        // ---- 协议文档版本：优先取在线生效版本，回退内置 ----
        const docVerEl = panel.querySelector('#aboutDocVersion');
        (async () => {
            try {
                const v = await api.getDocVersions();
                const eff = (v && v.effective && v.effective.agreement) || '';
                if (eff) {
                    const src = (v.source && v.source.agreement) || '';
                    docVerEl.textContent = eff + (src.includes('github.io') ? '（在线）' : '');
                }
            } catch (e) {
                console.error('读取协议文档版本失败:', e);
            }
        })();

        // ---- 协议文档弹窗（复用向导同款 Markdown 渲染） ----
        const DOC_TITLES = { agreement: '用户协议', privacy: '隐私声明', security: '数据的安全性', opensource: '开源软件声明', contact: '联系我们' };
        async function openDoc(name) {
            const title = DOC_TITLES[name] || name;
            let content = '';
            try {
                content = (await api.readDoc(name)) || '';
            } catch (e) {
                console.error('读取文档失败:', name, e);
            }
            const html = `
                <div class="about-doc-modal">
                    <div class="about-doc-head">${escapeHtml(title)}</div>
                    <div class="wizard-doc-body">${window.AppUtils.mdToHtml(content || '_（文档读取失败或为空）_')}</div>
                </div>
            `;
            const { dialog } = showModal(html);
            if (dialog) dialog.classList.add('wide');
        }

        panel.querySelectorAll('.about-doc-link').forEach(btn => {
            btn.addEventListener('click', () => openDoc(btn.dataset.doc));
        });
    }
};
