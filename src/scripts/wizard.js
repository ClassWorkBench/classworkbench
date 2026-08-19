// ============================================
// wizard.js — 首次使用设置向导
// 触发时机（main.js init 中 loadAll 之后）：
//   1. 全新安装（磁盘无 settings）→ 完整 7 步向导
//   2. 老用户已用过但未同意当前版本协议 → 仅协议确认
//   3. 已完成且协议版本一致 → 不弹
// 说明：向导期间禁止 Esc / 点击遮罩关闭（协议必须明确同意），
//       各配置步骤直接写 AppState + AppStorage，与设置面板同一套数据流。
// ============================================

(function () {
    'use strict';

    const AGREEMENT_VERSION = window.AppConfig.AGREEMENT_VERSION;
    const state = window.AppState;
    const { escapeHtml, toast } = window.AppUtils;
    const { saveSettings, saveSubjects } = window.AppStorage;
    const api = window.electronAPI;

    // ------------------------------------------------------------
    // 协议/文档内容（运行时经 IPC 从磁盘读取 .md 源文件，代码内不内置全文）
    // docs.agreement = 《用户协议》 / docs.privacy = 《隐私声明》 / docs.security = 《数据的安全性》 / docs.opensource = 《开源软件声明》 / docs.contact = 《联系我们》
    // ------------------------------------------------------------
    const docs = { agreement: '', privacy: '', security: '', opensource: '', contact: '' };

    // 协议/文档 Markdown 渲染已抽到公共工具 window.AppUtils.mdToHtml（见 utils.js）

    // ------------------------------------------------------------
    // 晚修时段校验（与 settings/general.js 同一套规则）
    // ------------------------------------------------------------
    const timeRe = /^([01]?\d|2[0-3]):([0-5]\d)$/;

    function normalizeTime(t) {
        const m = t.match(/^(\d{1,2}):(\d{2})$/);
        if (!m) return t;
        return m[1].padStart(2, '0') + ':' + m[2];
    }

    function validateEvening(value) {
        const eveStr = value.trim().replace(/，/g, ',').replace(/：/g, ':').replace(/－/g, '-');
        if (!eveStr) return { err: '不能为空' };
        const parts = eveStr.split(',').map(p => p.trim()).filter(Boolean);
        if (parts.length === 0) return { err: '至少需要一个时段' };
        for (const p of parts) {
            const [s, e] = p.split('-').map(x => x.trim());
            if (!s || !e) return { err: `格式错误："${p}" 应为 HH:MM-HH:MM` };
            if (!timeRe.test(s)) return { err: `开始时间无效："${s}"` };
            if (!timeRe.test(e)) return { err: `结束时间无效："${e}"` };
        }
        return {
            sections: parts.map(p => {
                const [s, e] = p.split('-').map(x => x.trim());
                return { start: normalizeTime(s), end: normalizeTime(e) };
            })
        };
    }

    // ------------------------------------------------------------
    // 步骤定义
    // ------------------------------------------------------------
    // full 模式：欢迎 → 协议 → 学科 → 班级偏好 → 加密 → 完成
    // agreement-only 模式：协议（老用户协议版本更新时）
    const STEPS_FULL = [
        { id: 'welcome',     label: '欢迎' },
        { id: 'agreement',   label: '协议' },
        { id: 'subjects',    label: '学科', skippable: true },
        { id: 'preferences', label: '偏好', skippable: true },  // 合并：晚修+天气+自启
        { id: 'encryption',  label: '加密', skippable: true },
        { id: 'done',        label: '完成' },
    ];
    const STEPS_AGREEMENT_ONLY = [
        { id: 'agreement',  label: '协议' },
    ];

    // 向导运行时状态
    let wiz = null;   // { steps, index, mode, overlay, dialog, resolve }

    // ------------------------------------------------------------
    // 各步骤渲染
    // ------------------------------------------------------------
    function renderStepHtml(stepId, mode) {
        switch (stepId) {
            case 'welcome':
                return `
                    <div class="wizard-welcome">
                        <div class="wizard-welcome-icon" aria-hidden="true">${emoji('🏫')}</div>
                        <h2>欢迎使用班级工作台</h2>
                        <div class="wizard-welcome-char-box" id="wizardCharBox"></div>
                        <p class="wizard-welcome-sub">为班级大屏打造的作业展示工具</p>
                    </div>
                `;
            case 'agreement': {
                const isUpdate = mode === 'agreement-only';
                return `
                    <div class="wizard-agreement">
                        ${isUpdate
                            ? '<p class="wizard-agreement-note">我们的《用户协议》与《隐私声明》有更新，需要您重新确认后继续使用。</p>'
                            : '<p class="wizard-agreement-note">使用本软件前，请阅读并同意以下协议：</p>'}
                        <div class="wizard-agreement-tabs" role="tablist">
                            <button type="button" class="wizard-agreement-tab active" data-doc="agreement" role="tab" aria-selected="true">
                                <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="8" y="4" width="32" height="40" rx="2" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 4H25V20L20.5 16L16 20V4Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 28H26" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M16 34H32" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>
                                用户协议
                            </button>
                            <button type="button" class="wizard-agreement-tab" data-doc="privacy" role="tab" aria-selected="false">
                                <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="24" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 41C4 32.1634 12.0589 25 22 25" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><rect x="27" y="31" width="14" height="10" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M37 31V28C37 26.3431 35.6569 25 34 25C32.3431 25 31 26.3431 31 28V31" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>
                                隐私声明
                            </button>
                        </div>
                        <div class="wizard-agreement-doc" id="wizardAgreementDoc">${window.AppUtils.mdToHtml(docs.agreement)}</div>
                        <div class="wizard-agreement-links">
                            <a class="wizard-agreement-security" href="javascript:void(0)" id="wizardSecurityLink">
                                <svg class="wizard-security-icon" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M6 9.25564L24.0086 4L42 9.25564V20.0337C42 31.3622 34.7502 41.4194 24.0026 45.0005C13.2521 41.4195 6 31.36 6 20.0287V9.25564Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>
                                    <path d="M15 23L22 30L34 18" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
                                </svg>
                                <span>数据的安全性</span>
                            </a>
                            <a class="wizard-agreement-security" href="javascript:void(0)" id="wizardOpensourceLink">
                                <svg class="wizard-security-icon" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M24.0004 11.619C26.0933 11.619 27.7899 9.91347 27.7899 7.80952C27.7899 5.70558 26.0933 4 24.0004 4C21.9075 4 20.2109 5.70558 20.2109 7.80952C20.2109 9.91347 21.9075 11.619 24.0004 11.619Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>
                                    <path d="M9.78947 40.1906C11.8823 40.1906 13.5789 38.485 13.5789 36.3811C13.5789 34.2771 11.8823 32.5715 9.78947 32.5715C7.69661 32.5715 6 34.2771 6 36.3811C6 38.485 7.69661 40.1906 9.78947 40.1906Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>
                                    <path d="M38.2104 40.1906C40.3032 40.1906 41.9998 38.485 41.9998 36.3811C41.9998 34.2771 40.3032 32.5715 38.2104 32.5715C36.1175 32.5715 34.4209 34.2771 34.4209 36.3811C34.4209 38.485 36.1175 40.1906 38.2104 40.1906Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>
                                    <path d="M33.1426 10.3142C38.444 13.4629 41.9999 19.2664 41.9999 25.9048C41.9999 26.4816 41.9731 27.0522 41.9206 27.6152V27.6152" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
                                    <path d="M31.014 42.575C28.8585 43.4926 26.4883 44.0001 24.0001 44.0001C21.512 44.0001 19.1418 43.4926 16.9863 42.575" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
                                    <path d="M6.07936 27.6152C6.02685 27.0522 6 26.4816 6 25.9048C6 19.2664 9.5559 13.4629 14.8573 10.3142" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
                                </svg>
                                <span>开源软件声明</span>
                            </a>
                            <a class="wizard-agreement-security" href="javascript:void(0)" id="wizardContactLink">
                                <svg class="wizard-security-icon" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M36 32C40.4183 32 44 28.4183 44 24C44 19.5817 40.4183 16 36 16" fill="none"/>
                                    <path d="M36 32C40.4183 32 44 28.4183 44 24C44 19.5817 40.4183 16 36 16" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>
                                    <path d="M12 16C7.58172 16 4 19.5817 4 24C4 28.4183 7.58172 32 12 32" fill="none"/>
                                    <path d="M12 16C7.58172 16 4 19.5817 4 24C4 28.4183 7.58172 32 12 32" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>
                                    <path d="M12 32V24V16C12 9.37258 17.3726 4 24 4C30.6274 4 36 9.37258 36 16V32C36 38.6274 30.6274 44 24 44" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
                                </svg>
                                <span>联系我们</span>
                            </a>
                        </div>
                        <label class="wizard-agreement-check">
                            <input type="checkbox" id="wizardAgreeCheck">
                            <span>我已阅读并同意<b>《用户协议》</b>和<b>《隐私声明》</b></span>
                        </label>
                    </div>
                `;
            }
            case 'subjects':
                return `
                    <h3 class="wizard-step-title">${emoji('📚')} 学科设置</h3>
                    <p class="wizard-step-desc">大屏卡片和底栏会按这些学科展示。已为您预置常见学科，可删除不需要的或添加缺少的。</p>
                    <div class="wizard-subject-list" id="wizardSubjectList"></div>
                    <div class="setting-group">
                        <div class="setting-row">
                            <input id="wizardNewSubjName" placeholder="新学科名，如：地理" class="input-flex" aria-label="新学科名称">
                            <button class="color-swatch-btn" id="wizardNewSubjColor" style="background:#5b6abf" aria-label="学科颜色"></button>
                            <button class="btn primary" id="wizardAddSubjBtn">+ 添加</button>
                        </div>
                    </div>
                `;
            case 'preferences': {
                const eveningStr = state.settings.eveningSections.map(s => s.start + '-' + s.end).join(', ');
                return `
                    <h3 class="wizard-step-title">${emoji('⚙️')} 班级偏好</h3>
                    <p class="wizard-step-desc">为大屏设置基础信息，可稍后在设置中调整。</p>

                    <div class="setting-group">
                        <label>${emoji('⏰')} 晚修时段</label>
                        <input id="wizardEveningInput" value="${escapeHtml(eveningStr)}" placeholder="如 19:00-19:50, 20:00-20:50" aria-label="晚修时段">
                        <small>顶栏显示当前晚修进度，逗号分隔多个时段，格式 HH:MM-HH:MM</small>
                        <small class="field-error-msg" id="wizardEveningError" style="display:none;"></small>
                    </div>

                    <div class="setting-group">
                        <label>${emoji('🌤️')} 天气城市</label>
                        <div class="weather-search-wrap">
                            <input type="text" id="wizardWeatherSearch" placeholder="输入城市名搜索，如：北京、上海" autocomplete="off" spellcheck="false">
                            <div class="weather-search-results" id="wizardWeatherResults" style="display:none;"></div>
                        </div>
                        <div class="weather-city-list" id="wizardCityList"></div>
                    </div>

                    <div class="setting-group">
                        <div class="toggle-row">
                            <div class="toggle-row-text">
                                <span class="toggle-row-title">${emoji('🚀')} 开机自启</span>
                                <span class="toggle-row-desc">登录 Windows 时自动启动班级工作台（教室大屏建议开启）</span>
                            </div>
                            <label class="setting-toggle">
                                <input type="checkbox" id="wizardAutoLaunchToggle" aria-label="开机自动启动班级工作台">
                                <span class="toggle-slider"></span>
                            </label>
                        </div>
                    </div>
                `;
            }
            case 'encryption': {
                return `
                    <h3 class="wizard-step-title">
                        <img class="emoji" src="icons/locked_flat.svg" alt="数据加密">
                        数据加密
                    </h3>
                    <p class="wizard-step-desc">作业、学科、设置等数据将<b>加密存储</b>在您的电脑上（AES-256-GCM），防止恶意软件扫描磁盘窃取数据；密钥由 Windows 凭据保护，仅您本机可解。</p>
                    <div class="setting-group">
                        <div class="toggle-row">
                            <div class="toggle-row-text">
                                <span class="toggle-row-title">启用数据加密</span>
                                <span class="toggle-row-desc">推荐开启；关闭后数据以明文 JSON 存储</span>
                            </div>
                            <label class="setting-toggle">
                                <input type="checkbox" id="wizardEncryptionToggle" checked>
                                <span class="toggle-slider"></span>
                            </label>
                        </div>
                    </div>
                `;
            }
            case 'done': {
                const subjects = state.subjectList;
                const evening = state.settings.eveningSections;
                const cities = state.settings.openmeteoCities || [];
                return `
                    <div class="wizard-done">
                        <div class="wizard-done-icon" aria-hidden="true">${emoji('✅')}</div>
                        <h2>一切就绪！</h2>
                        <ul class="wizard-done-summary">
                            <li>${emoji('📚')} 学科 ${subjects.length} 个：${escapeHtml(subjects.slice(0, 6).map(s => s.name).join('、'))}${subjects.length > 6 ? ' 等' : ''}</li>
                            <li>${emoji('⏰')} 晚修时段 ${evening.length} 段（${escapeHtml(evening.map(s => s.start + '-' + s.end).join('、'))}）</li>
                            <li>${emoji('🌤️')} 天气城市：${cities.length > 0 ? escapeHtml(cities.map(c => c.name).join('、')) : '未添加（可稍后在设置中添加）'}</li>
                            <li><img class="emoji" src="icons/locked_flat.svg" alt="🔒"> 数据加密：${state.settings.dataEncryption !== false ? '已开启（AES-256-GCM）' : '未开启（明文 JSON）'}</li>
                        </ul>
                        <p class="wizard-done-hint">更多功能（QQ 作业捕获、个性化、辅助功能、备份）随时可在 <b>底栏 ${emoji('⚙️')} 设置</b> 中调整。</p>
                    </div>
                `;
            }
            default:
                return '';
        }
    }

    // ------------------------------------------------------------
    // 各步骤事件绑定（body：向导内容区 DOM）
    // ------------------------------------------------------------
    // ------------------------------------------------------------
    // 逐字符滑入/滑出欢迎动画
    // ------------------------------------------------------------
    const WELCOME_WORDS = [
        '你好',          // 中文
        'Hello',         // 英文
        'こんにちは',    // 日文
        '안녕하세요',    // 韩文
        'Hola',          // 西班牙文
        'Bonjour',       // 法文
        'Hallo',         // 德文
    ];

    const CHAR_DELAY = 80;
    const STAY_TIME = 2200;
    const ANIM_DUR = 500;

    let _welcomeCharTimer = null;

    function clearCharBox() {
        const box = document.getElementById('wizardCharBox');
        if (box) box.innerHTML = '';
    }

    function createWordDom(text) {
        const box = document.getElementById('wizardCharBox');
        if (!box) return null;
        const wrap = document.createElement('div');
        wrap.className = 'wizard-welcome-char-wrap';
        const chars = [...text];
        chars.forEach(c => {
            const span = document.createElement('span');
            span.className = 'wizard-welcome-char';
            span.textContent = c;
            wrap.appendChild(span);
        });
        box.appendChild(wrap);
        return wrap;
    }

    function playWord(index) {
        clearCharBox();
        const text = WELCOME_WORDS[index];
        const wordDom = createWordDom(text);
        if (!wordDom) return;
        const charList = Array.from(wordDom.querySelectorAll('.wizard-welcome-char'));

        // 关键：强制 reflow，让浏览器先"提交"字母的初始态（opacity:0 / translateX(80px)）。
        // 否则首字母的 setTimeout(0) 会在元素从未渲染过初始态的同帧内改成最终态，
        // transition 没有可过渡的起点 → 首字母直接闪现（时好时坏取决于帧时序）。
        void wordDom.offsetWidth;

        // 逐个字符从右侧滑入
        charList.forEach((char, i) => {
            setTimeout(() => {
                char.style.transform = 'translateX(0)';
                char.style.opacity = '1';
            }, i * CHAR_DELAY);
        });

        // 全部滑入完成 + 停留后，逐个字符向左滑出
        const finishAllInTime = charList.length * CHAR_DELAY + STAY_TIME;
        setTimeout(() => {
            charList.forEach((char, i) => {
                setTimeout(() => {
                    char.style.transition = `transform ${ANIM_DUR}ms ease-in, opacity ${ANIM_DUR}ms ease-in`;
                    char.style.transform = 'translateX(-100px)';
                    char.style.opacity = '0';
                }, i * CHAR_DELAY);
            });
        }, finishAllInTime);

        // 全部滑出后，切换下一个词
        const totalTime = finishAllInTime + charList.length * CHAR_DELAY + ANIM_DUR;
        _welcomeCharTimer = setTimeout(() => {
            const nextIdx = (index + 1) % WELCOME_WORDS.length;
            playWord(nextIdx);
        }, totalTime);
    }

    // 弹窗查看协议/文档全文（叠加在向导之上，可点遮罩/Esc/✕ 关闭；信息性文档，无需同意）
    function openDoc(name, title) {
        const root = state.dom.modalRoot();
        const overlay = document.createElement('div');
        overlay.className = 'overlay wizard-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', title);
        overlay.innerHTML = `
            <div class="dialog wizard-dialog wizard-doc-dialog">
                <div class="wizard-doc-head">
                    <h3>${title}</h3>
                    <button type="button" class="wizard-doc-close" aria-label="关闭">✕</button>
                </div>
                <div class="wizard-doc-body">${window.AppUtils.mdToHtml(docs[name] || '')}</div>
            </div>
        `;
        const close = () => {
            overlay.remove();
            if (!root.querySelector('.overlay')) document.body.classList.remove('modal-open');
        };
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
        overlay.querySelector('.wizard-doc-close').addEventListener('click', close);
        root.appendChild(overlay);
        document.body.classList.add('modal-open');
    }

    function startWelcomeCharAnimation() {
        playWord(0);
    }

    function stopWelcomeCharAnimation() {
        if (_welcomeCharTimer) {
            clearTimeout(_welcomeCharTimer);
            _welcomeCharTimer = null;
        }
        clearCharBox();
    }

    function bindStep(stepId, body) {
        if (stepId === 'done') {
            // 最后一步（完成页）：用户停留时提前预热天气/背景等资源，
            // 避免点"开始使用"后主界面首次加载卡顿。
            window.dispatchEvent(new CustomEvent('wizard:near-complete'));
            return;
        }

        if (stepId === 'welcome') {
            startWelcomeCharAnimation();
            wiz.cleanupFns.push(stopWelcomeCharAnimation);
            return;
        }

        if (stepId === 'agreement') {
            const doc = body.querySelector('#wizardAgreementDoc');
            body.querySelectorAll('.wizard-agreement-tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    body.querySelectorAll('.wizard-agreement-tab').forEach(t => {
                        t.classList.toggle('active', t === tab);
                        t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
                    });
                    doc.innerHTML = window.AppUtils.mdToHtml(tab.dataset.doc === 'agreement' ? docs.agreement : docs.privacy);
                    doc.scrollTop = 0;
                    updateFooter();
                });
            });
            body.querySelector('#wizardAgreeCheck').addEventListener('change', updateFooter);
        body.querySelector('#wizardSecurityLink').addEventListener('click', () => openDoc('security', '数据的安全性'));
        body.querySelector('#wizardOpensourceLink').addEventListener('click', () => openDoc('opensource', '开源软件声明'));
        body.querySelector('#wizardContactLink').addEventListener('click', () => openDoc('contact', '联系我们'));
            return;
        }

        if (stepId === 'encryption') {
            const cb = body.querySelector('#wizardEncryptionToggle');
            if (cb) {
                cb.checked = state.settings.dataEncryption !== false;
                cb.addEventListener('change', async () => {
                    state.settings.dataEncryption = cb.checked;
                    try { await saveSettings(); }
                    catch (e) { console.error('保存加密设置失败:', e); }
                });
            }
            return;
        }

        if (stepId === 'subjects') {
            renderWizardSubjects();
            const nameInput = body.querySelector('#wizardNewSubjName');
            let selectedColor = '#5b6abf';
            const colorBtn = body.querySelector('#wizardNewSubjColor');
            if (window.ColorPicker) {
                window.ColorPicker.init(colorBtn, selectedColor, (color) => {
                    selectedColor = color;
                    colorBtn.style.background = color;
                });
            }
            body.querySelector('#wizardAddSubjBtn').addEventListener('click', async () => {
                const name = nameInput.value.trim();
                if (!name) { toast('请输入学科名'); return; }
                if (state.subjectList.some(s => s.name === name)) { toast('学科已存在'); return; }
                state.subjectList.push({ id: 'subj_' + Date.now(), name, color: selectedColor });
                await saveSubjects();
                nameInput.value = '';
                renderWizardSubjects();
            });
            nameInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') body.querySelector('#wizardAddSubjBtn').click();
            });
            return;
        }

        if (stepId === 'preferences') {
            // ===== 晚修时段输入校验（沿用原 evening 步骤逻辑）=====
            const input = body.querySelector('#wizardEveningInput');
            const error = body.querySelector('#wizardEveningError');
            input.addEventListener('input', () => {
                const { err } = validateEvening(input.value);
                if (err) {
                    input.classList.add('input-error');
                    error.textContent = err;
                    error.style.display = 'block';
                } else {
                    input.classList.remove('input-error');
                    error.style.display = 'none';
                }
            });
            input.addEventListener('change', () => saveWizardEvening(input.value));

            // ===== 天气城市搜索（沿用原 weather 步骤逻辑）=====
            const searchInput = body.querySelector('#wizardWeatherSearch');
            const results = body.querySelector('#wizardWeatherResults');
            let searchTimer = null;
            let searchSeq = 0;

            renderWizardCities();

            searchInput.addEventListener('input', () => {
                const kw = searchInput.value.trim();
                clearTimeout(searchTimer);
                if (!kw) { results.style.display = 'none'; return; }
                searchTimer = setTimeout(() => doWizardSearch(kw), 400);
            });
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const first = results.querySelector('.weather-search-item');
                    if (first) first.click();
                }
            });
            // 点击其他区域收起搜索结果
            const onDocClick = (e) => {
                if (!e.target.closest('.weather-search-wrap')) results.style.display = 'none';
            };
            document.addEventListener('click', onDocClick);
            wiz.cleanupFns.push(() => document.removeEventListener('click', onDocClick));

            async function doWizardSearch(keyword) {
                const mySeq = ++searchSeq;
                try {
                    const list = await window.AppWeather.searchCities(keyword);
                    if (mySeq !== searchSeq) return;
                    if (!list || list.length === 0) {
                        results.innerHTML = '<div class="weather-search-empty">未找到"' + escapeHtml(keyword) + '"，请换个关键词试试</div>';
                        results.style.display = 'block';
                        return;
                    }
                    results.innerHTML = '';
                    list.forEach(city => {
                        const item = document.createElement('div');
                        item.className = 'weather-search-item';
                        const region = [city.country, city.admin1].filter(Boolean).join(' · ');
                        item.innerHTML = '<span class="weather-search-item-name">' + escapeHtml(city.name) + '</span>' +
                            (region ? '<span class="weather-search-item-region">' + escapeHtml(region) + '</span>' : '');
                        item.addEventListener('click', async () => {
                            const cities = state.settings.openmeteoCities || [];
                            if (cities.some(c => c.id === city.id)) { toast('"' + city.name + '" 已在列表中'); return; }
                            cities.push({ id: city.id, name: city.name, lat: city.lat, lon: city.lon, country: city.country || '', admin1: city.admin1 || '', timezone: city.timezone || 'auto' });
                            state.settings.openmeteoCities = cities;
                            await saveSettings();
                            results.style.display = 'none';
                            searchInput.value = '';
                            renderWizardCities();
                        });
                        results.appendChild(item);
                    });
                    results.style.display = 'block';
                } catch (err) {
                    if (mySeq !== searchSeq) return;
                    results.innerHTML = '<div class="weather-search-empty">搜索失败，请检查网络后重试</div>';
                    results.style.display = 'block';
                }
            }

            // ===== 开机自启开关（沿用原 autolaunch 步骤逻辑）=====
            const toggle = body.querySelector('#wizardAutoLaunchToggle');
            (async () => {
                try {
                    const res = await api.getAutoLaunch();
                    if (res && res.success) toggle.checked = !!res.enabled;
                } catch (e) {
                    console.error('[向导] 读取开机自启状态失败:', e);
                }
            })();
            toggle.addEventListener('change', async () => {
                const enabled = toggle.checked;
                const res = await api.setAutoLaunch(enabled);
                if (!res || res.success === false) {
                    toggle.checked = !enabled;
                    toast('开机自启设置失败');
                }
            });
            return;
        }
    }

    // 学科列表渲染（学科步骤内）
    function renderWizardSubjects() {
        const listDiv = wiz.dialog.querySelector('#wizardSubjectList');
        if (!listDiv) return;
        listDiv.innerHTML = state.subjectList.map(s => `
            <div class="subject-manage-item">
                <span class="color-dot" style="background:${s.color};"></span>
                <span class="name">${escapeHtml(s.name)}</span>
                <button class="del-btn" data-del="${s.id}" aria-label="删除 ${escapeHtml(s.name)}">✕</button>
            </div>
        `).join('');
        listDiv.querySelectorAll('.del-btn').forEach(b => {
            b.addEventListener('click', async (e) => {
                if (state.subjectList.length <= 1) { toast('至少保留一个学科'); return; }
                const id = e.currentTarget.dataset.del;
                state.subjectList = state.subjectList.filter(s => s.id !== id);
                await saveSubjects();
                renderWizardSubjects();
            });
        });
    }

    // 天气城市列表渲染（天气步骤内）
    function renderWizardCities() {
        const container = wiz.dialog.querySelector('#wizardCityList');
        if (!container) return;
        const cities = state.settings.openmeteoCities || [];
        if (cities.length === 0) {
            container.innerHTML = '<div class="weather-city-empty">还没有添加城市，在上方搜索并添加</div>';
            return;
        }
        container.innerHTML = cities.map((c, i) => {
            const region = [c.country, c.admin1].filter(Boolean).join(' · ');
            return '<div class="weather-city-item" data-index="' + i + '">' +
                '<span class="weather-city-name">' + escapeHtml(c.name) + '</span>' +
                (region ? '<span class="weather-city-region">' + escapeHtml(region) + '</span>' : '') +
                '<span class="weather-city-badge">' + (i === 0 ? '显示中' : '') + '</span>' +
                '<button class="weather-city-del" data-index="' + i + '" title="移除">&times;</button>' +
                '</div>';
        }).join('');
        container.querySelectorAll('.weather-city-del').forEach(btn => {
            btn.addEventListener('click', async () => {
                const idx = parseInt(btn.dataset.index);
                state.settings.openmeteoCities.splice(idx, 1);
                await saveSettings();
                renderWizardCities();
            });
        });
    }

    // 晚修时段保存（晚修步骤内）
    async function saveWizardEvening(value) {
        const { err, sections } = validateEvening(value);
        if (err) return false;
        state.settings.eveningSections = sections;
        await saveSettings();
        return true;
    }

    // ------------------------------------------------------------
    // 步骤框架：进度指示 / 底部按钮 / 切换
    // ------------------------------------------------------------
    function currentStep() {
        return wiz.steps[wiz.index];
    }

    function renderStepsIndicator() {
        const el = wiz.dialog.querySelector('.wizard-steps');
        el.innerHTML = wiz.steps.map((s, i) => {
            const cls = i < wiz.index ? 'done' : (i === wiz.index ? 'active' : '');
            return '<div class="wizard-step-dot ' + cls + '" data-i="' + i + '">' +
                '<span class="wizard-step-dot-circle">' + (i < wiz.index ? '✓' : (i + 1)) + '</span>' +
                '<span class="wizard-step-dot-label">' + s.label + '</span>' +
                '</div>';
        }).join('');
    }

    function updateFooter() {
        const step = currentStep();
        const prevBtn = wiz.dialog.querySelector('.wizard-btn-prev');
        const nextBtn = wiz.dialog.querySelector('.wizard-btn-next');
        const skipBtn = wiz.dialog.querySelector('.wizard-btn-skip');

        prevBtn.style.visibility = wiz.index > 0 ? 'visible' : 'hidden';

        // 下一步文案
        if (step.id === 'welcome') nextBtn.textContent = '开始配置';
        else if (step.id === 'done') nextBtn.textContent = '开始使用';
        else if (wiz.mode === 'agreement-only' && step.id === 'agreement') nextBtn.textContent = '同意并继续';
        else if (wiz.steps[wiz.index + 1] && wiz.steps[wiz.index + 1].id === 'done') nextBtn.textContent = '完成配置';
        else nextBtn.textContent = '下一步';

        // 协议步：未勾选时禁用下一步
        if (step.id === 'agreement') {
            const check = wiz.dialog.querySelector('#wizardAgreeCheck');
            nextBtn.disabled = !(check && check.checked);
        } else {
            nextBtn.disabled = false;
        }

        // 跳过按钮：仅可跳过步骤显示
        skipBtn.style.visibility = step.skippable ? 'visible' : 'hidden';
    }

    function renderStep(dir) {
        const step = currentStep();
        const body = wiz.dialog.querySelector('.wizard-body');

        // 淡出当前内容
        body.classList.remove('wizard-step-enter');
        body.classList.add('wizard-step-leave');

        const doRender = () => {
            body.classList.remove('wizard-step-leave');
            body.innerHTML = renderStepHtml(step.id, wiz.mode);
            body.scrollTop = 0;
            // 触发淡入
            body.offsetHeight; // reflow
            body.classList.add('wizard-step-enter');
            bindStep(step.id, body);
            renderStepsIndicator();
            updateFooter();
        };

        if (dir) {
            // 有方向时才做淡出过渡
            setTimeout(doRender, 180);
        } else {
            // 首次渲染直接显示
            doRender();
        }
    }

    // 前进校验：返回 false 阻止进入下一步
    async function beforeNext() {
        const step = currentStep();
        if (step.id === 'preferences') {
            const input = wiz.dialog.querySelector('#wizardEveningInput');
            const ok = await saveWizardEvening(input ? input.value : '');
            if (!ok) {
                toast('晚修时段格式有误，请修正后再继续');
                if (input) input.focus();
                return false;
            }
        }
        if (step.id === 'subjects' && state.subjectList.length === 0) {
            toast('至少保留一个学科');
            return false;
        }
        return true;
    }

    function goNext() {
        (async () => {
            if (!(await beforeNext())) return;
            if (wiz.index < wiz.steps.length - 1) {
                wiz.index++;
                renderStep(1);
            } else {
                await finishWizard();
            }
        })();
    }

    function goPrev() {
        if (wiz.index > 0) {
            wiz.index--;
            renderStep(-1);
        }
    }

    function goSkip() {
        const step = currentStep();
        if (!step.skippable) return;
        if (wiz.index < wiz.steps.length - 1) {
            wiz.index++;
            renderStep(1);
        }
    }

    // ------------------------------------------------------------
    // 完成 / 关闭
    // ------------------------------------------------------------
    async function finishWizard() {
        state.settings.wizardCompleted = true;
        state.settings.acceptedAgreementVersion = AGREEMENT_VERSION;
        await saveSettings();
        closeWizard(true);
    }

    function closeWizard(completed) {
        if (!wiz) return;
        // 清理文档级监听（如天气搜索的点击收起）
        wiz.cleanupFns.forEach(fn => { try { fn(); } catch (_) {} });
        const { overlay, dialog, resolve } = wiz;
        dialog.classList.add('closing');
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.25s ease';
        setTimeout(() => {
            if (overlay.parentNode) overlay.remove();
            const root = state.dom.modalRoot();
            if (!root.querySelector('.overlay')) {
                document.body.classList.remove('modal-open');
            }
            resolve(completed);
        }, 250);
        wiz = null;
    }

    // ------------------------------------------------------------
    // 对外入口
    // ------------------------------------------------------------
    /**
     * 判断是否需要弹向导并按需启动。
     * @returns {Promise<boolean>} 向导已展示时 resolve(true)（用户完成/同意），
     *                             无需展示时立即 resolve(false)。
     */
    function maybeStart() {
        const s = state.settings;
        if (s.wizardCompleted && s.acceptedAgreementVersion === AGREEMENT_VERSION) {
            return Promise.resolve(false);  // 已完成且协议版本一致
        }
        if (s.wizardCompleted) {
            return start('agreement-only');  // 老用户：协议有更新
        }
        // 未走过向导：全新安装走完整向导；老版本升级用户只确认协议
        return start(window.AppStorage.isFreshInstall ? 'full' : 'agreement-only');
    }

    /**
     * 启动向导。
     * @param {'full'|'agreement-only'} mode
     */
    function start(mode) {
        return new Promise((resolve) => {
            if (wiz) { resolve(false); return; }  // 防重入

            // 协议/文档运行时读取（磁盘 .md 源文件，代码内不内置全文）
            Promise.all([
                api.readDoc('agreement'),
                api.readDoc('privacy'),
                api.readDoc('security'),
                api.readDoc('opensource'),
                api.readDoc('contact')
            ]).then(([ag, pr, sec, os, ct]) => {
                docs.agreement = ag || '';
                docs.privacy = pr || '';
                docs.security = sec || '';
                docs.opensource = os || '';
                docs.contact = ct || '';
                renderStep();
            }).catch((e) => {
                console.error('读取协议文档失败:', e);
                renderStep();
            });

            wiz = {
                mode,
                steps: mode === 'full' ? STEPS_FULL : STEPS_AGREEMENT_ONLY,
                index: 0,
                cleanupFns: [],
                resolve,
            };

            // 自建 overlay（不用 showModal：向导禁止 Esc/点遮罩关闭）
            const overlay = document.createElement('div');
            overlay.className = 'overlay wizard-overlay';
            overlay.innerHTML = `<div class="wizard-overlay-glow"></div>`;
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-modal', 'true');
            overlay.setAttribute('aria-label', '首次使用设置向导');
            const dialog = document.createElement('div');
            dialog.className = 'dialog wizard-dialog';
            dialog.innerHTML = `
                <div class="wizard-header">
                    <div class="wizard-steps"></div>
                </div>
                <div class="wizard-body"></div>
                <div class="wizard-footer">
                    <button type="button" class="btn wizard-btn-skip">跳过此步</button>
                    <div class="wizard-footer-right">
                        <button type="button" class="btn wizard-btn-prev">上一步</button>
                        <button type="button" class="btn primary wizard-btn-next">下一步</button>
                    </div>
                </div>
            `;
            overlay.appendChild(dialog);
            wiz.overlay = overlay;
            wiz.dialog = dialog;

            const root = state.dom.modalRoot();
            root.innerHTML = '';
            root.appendChild(overlay);
            document.body.classList.add('modal-open');

            // 仅拦截 Esc 用于"上一步"导航，不关闭向导
            overlay.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && wiz && wiz.index > 0 && wiz.mode === 'full') {
                    e.preventDefault();
                    goPrev();
                }
            });

            dialog.querySelector('.wizard-btn-next').addEventListener('click', goNext);
            dialog.querySelector('.wizard-btn-prev').addEventListener('click', goPrev);
            dialog.querySelector('.wizard-btn-skip').addEventListener('click', goSkip);

            // renderStep() 在文档读取完成后调用（见上方 Promise.all）
        });
    }

    window.AppWizard = { maybeStart, start };
})();
