// ============================================
// settings/about.js — 关于面板
// 导航最底"关于"项：应用名片 / 版本号 / 检查更新 / 本次更新日志
// ============================================

window.SettingsModules = window.SettingsModules || {};

window.SettingsModules.about = {
    render(ctx) {
        return `
                    <!-- 面板：关于 -->
                    <div class="settings-panel" id="panel-about">
                        <div class="panel-header">
                            <h3>关于班级工作台</h3>
                            <p class="panel-desc">版本信息与更新日志</p>
                        </div>
                        <div class="panel-body">
                            <div class="about-hero">
                                <div class="about-logo">${emoji('📖')}</div>
                                <div class="about-name">
                                    <h2>班级工作台</h2>
                                    <p>ClassWorkBench · 班级作业与晚修管理桌面工具</p>
                                </div>
                            </div>

                            <div class="about-meta">
                                <div class="about-meta-row"><span>版本</span><b id="aboutVersion">加载中…</b></div>
                            </div>

                            <button class="about-update-btn" id="aboutCheckUpdate" type="button">
                                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 12C20 16.4183 16.4183 20 12 20C8.8568 20 6.11573 18.1083 4.79495 15.4M4 12C4 7.58172 7.58172 4 12 4C15.1302 4 17.8612 5.87895 19.1884 8.57" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 21V15.4H9.6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 3V8.57H14.4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                                <span class="update-label">检查更新</span>
                            </button>

                            <div class="about-updates" id="aboutUpdates">
                                <div class="about-updates-title">本次更新</div>
                                <div class="about-updates-empty">加载中…</div>
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

        // ---- 本次更新：拉取 GitHub 最新 release 说明（更新日志） ----
        const updatesEl = panel.querySelector('#aboutUpdates');
        function notesHtml(notes, version) {
            if (!notes || !String(notes).trim()) {
                return '<div class="about-updates-title">本次更新</div><div class="about-updates-empty">暂无更新日志</div>';
            }
            const lines = String(notes).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
            const items = lines.map(l => {
                const m = l.match(/^[-•*]\s+(.*)$/);
                return `<li>${escapeHtml(m ? m[1] : l)}</li>`;
            }).join('');
            const verHtml = version ? ` <em class="about-updates-ver">v${escapeHtml(version)}</em>` : '';
            return `<div class="about-updates-title">本次更新${verHtml}</div><ul class="about-updates-list">${items}</ul>`;
        }
        api.update.releaseNotes().then(r => {
            updatesEl.innerHTML = notesHtml(r && r.notes, r && r.version);
        }).catch(() => {
            updatesEl.innerHTML = '<div class="about-updates-title">本次更新</div><div class="about-updates-empty">无法获取更新日志</div>';
        });

        // ---- 检查更新（electron-updater + GitHub Releases） ----
        const updateBtn = panel.querySelector('#aboutCheckUpdate');
        const updateLabel = updateBtn.querySelector('.update-label');
        let curVer = '';
        api.getVersion().then(res => { if (res && res.success && res.version) curVer = res.version; }).catch(() => {});

        function renderBtn(st) {
            const s = st || {};
            if (s.status === 'available') {
                updateBtn.classList.add('has-update');
                updateLabel.textContent = `有新版本 v${s.version}`;
            } else if (s.status === 'downloaded') {
                updateBtn.classList.add('has-update');
                updateLabel.textContent = `更新已就绪 v${s.version}`;
            } else if (s.status === 'downloading') {
                updateBtn.classList.add('has-update');
                updateLabel.textContent = `正在下载 ${s.percent || 0}%`;
            } else {
                updateBtn.classList.remove('has-update');
                updateLabel.textContent = '检查更新';
            }
        }
        // 面板打开时同步一次状态（覆盖启动静默检查的结果）
        api.update.getState().then(s => { if (s) renderBtn(s); }).catch(() => {});

        function openUpdateDialog() {
            const html = `
                <div class="update-dialog">
                    <div class="update-dialog-title">软件更新</div>
                    <div class="update-dialog-body" id="updateBody">正在检查更新…</div>
                    <div class="dialog-btn-row" id="updateActions"></div>
                </div>
            `;
            const { dialog, close } = showModal(html, () => {
                if (off) { off(); off = null; }
                // 对话框关闭后刷新按钮（下载完/还有更新时保持高亮）
                api.update.getState().then(s => { if (s) renderBtn(s); }).catch(() => {});
            });
            if (dialog) dialog.classList.add('update-dialog');
            const body = dialog.querySelector('#updateBody');
            const actions = dialog.querySelector('#updateActions');
            let off = null;
            let cachedNotes = null;
            api.update.releaseNotes().then(r => { cachedNotes = r; }).catch(() => {});

            function set(msg, actionHtml) {
                body.innerHTML = msg;
                actions.innerHTML = actionHtml || '';
            }

            // 打开即发起检查；开发模式直接提示
            api.update.check().then(res => {
                if (res && res.dev) {
                    set('开发模式下无法检查更新。', '<button class="btn" id="uOk">好</button>');
                    actions.querySelector('#uOk').onclick = close;
                    if (off) { off(); off = null; }
                }
            }).catch(() => {});

            off = api.update.onEvent((ev) => {
                switch (ev.type) {
                    case 'checking':
                        set('正在检查更新…', '');
                        break;
                    case 'available':
                        set(`发现新版本 <b>v${ev.version}</b><div class="update-cur">当前版本 v${curVer}</div>${cachedNotes && cachedNotes.notes ? notesHtml(cachedNotes.notes, cachedNotes.version) : ''}`,
                            '<button class="btn primary" id="uDownload">立即下载</button><button class="btn" id="uLater">稍后再说</button>');
                        actions.querySelector('#uDownload').onclick = () => {
                            api.update.download();
                            set('正在下载更新…', '<div class="update-progress" id="uProgress">0%</div>');
                        };
                        actions.querySelector('#uLater').onclick = close;
                        break;
                    case 'progress': {
                        const p = actions.querySelector('#uProgress');
                        if (p) p.textContent = (ev.percent || 0) + '%';
                        break;
                    }
                    case 'downloaded':
                        set(`更新已就绪 <b>v${ev.version}</b><div class="update-cur">点击安装后应用将自动重启</div>`,
                            '<button class="btn primary" id="uInstall">立即重启安装</button><button class="btn" id="uLater2">稍后再说</button>');
                        actions.querySelector('#uInstall').onclick = () => api.update.install();
                        actions.querySelector('#uLater2').onclick = close;
                        break;
                    case 'not-available':
                        set(`当前已是最新版本<div class="update-cur">v${ev.version || curVer}</div>`,
                            '<button class="btn" id="uOk2">好</button>');
                        actions.querySelector('#uOk2').onclick = close;
                        break;
                    case 'error':
                        set(`检查更新失败：<div class="update-err">${escapeHtml(ev.message || '未知错误')}</div>`,
                            '<button class="btn" id="uOk3">好</button>');
                        actions.querySelector('#uOk3').onclick = close;
                        break;
                }
            });
        }

        updateBtn.addEventListener('click', openUpdateDialog);
    }
};
