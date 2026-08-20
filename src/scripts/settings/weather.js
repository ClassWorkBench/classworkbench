// ============================================
// settings/weather.js — 天气面板
// 城市搜索、管理列表、API 配置、刷新策略
// ============================================

window.SettingsModules = window.SettingsModules || {};

function _weatherCityListKey() {
    var provider = window.AppState.settings.weatherProvider || 'openmeteo';
    return provider === 'qweather' ? 'qweatherCities' : 'openmeteoCities';
}

function _weatherCityList() {
    var key = _weatherCityListKey();
    return window.AppState.settings[key] || [];
}

function _weatherSetCityList(list) {
    var key = _weatherCityListKey();
    window.AppState.settings[key] = list;
}

window.SettingsModules.weather = {
    render(ctx) {
        const { settings, escapeHtml, REFRESH_OPTIONS } = ctx;
        const cities = _weatherCityList();

        const cityListHtml = cities.map(function (c, i) {
            var region = [c.country, c.admin1].filter(Boolean).join(' · ');
            return '<div class="weather-city-item" draggable="true" data-index="' + i + '">' +
                '<span class="weather-city-drag">⠿</span>' +
                '<span class="weather-city-name">' + escapeHtml(c.name) + '</span>' +
                (region ? '<span class="weather-city-region">' + escapeHtml(region) + '</span>' : '') +
                '<span class="weather-city-badge">' + (i === 0 ? '显示中' : '') + '</span>' +
                '<button class="weather-city-del" data-index="' + i + '" title="移除">&times;</button>' +
                '</div>';
        }).join('') || '<div class="weather-city-empty">还没有添加城市，在上方搜索并添加</div>';

        return `
                    <!-- 面板：天气 -->
                    <div class="settings-panel" id="panel-weather">
                        <div class="panel-header">
                            <h3>天气</h3>
                            <p class="panel-desc">选择天气 API 来源、配置参数与刷新策略</p>
                        </div>
                        <div class="panel-body">
                            <div class="setting-group" id="qwTopGroup">
                                <div class="setting-label-row">
                                    <label for="weatherProviderSelect">天气 API</label>
                                    <span class="qw-status-inline" id="qwStatusInline" style="display:${settings.weatherProvider === 'qweather' ? '' : 'none'};">
                                        <span class="qw-status-dot" id="qweatherStatusDot"></span>
                                        <span id="qweatherStatusText">检测中…</span>
                                    </span>
                                </div>
                                <select id="weatherProviderSelect" aria-label="选择天气数据来源">
                                    <option value="openmeteo" ${settings.weatherProvider === 'qweather' ? '' : 'selected'}>Open-Meteo（免费，简单）</option>
                                    <option value="qweather" ${settings.weatherProvider === 'qweather' ? 'selected' : ''}>和风天气（需配置 API）</option>
                                </select>
                                <small>和风天气需 JWT 认证配置 — <a href="#" id="qweatherConfigLink" class="link-accent">${settings.qweatherApiHost && settings.qweatherKid && settings.qweatherSub && settings.qweatherPrivateKey ? '修改 API 配置' : '配置 API 认证'}</a></small>
                            </div>
                            <!-- 城市搜索 + 已添加城市：和风天气需检测通过后方可展开 -->
                            <div id="weatherCitySection" class="qw-city-section" style="${settings.weatherProvider === 'qweather' && !(settings.qweatherApiHost && settings.qweatherKid && settings.qweatherSub && settings.qweatherPrivateKey) ? 'max-height:0;opacity:0;' : 'max-height:900px;opacity:1;'}">
                                <div class="setting-group">
                                    <label>城市搜索</label>
                                    <div class="weather-search-wrap">
                                        <input type="text" id="weatherSearchInput" placeholder="输入城市名搜索，如：北京、上海、纽约" autocomplete="off" spellcheck="false" />
                                        <div class="weather-search-results" id="weatherSearchResults" style="display:none;"></div>
                                    </div>
                                    <small>搜索后点击结果即可添加到下方列表，拖拽排序，仅第一个城市显示在主界面</small>
                                </div>
                                <div class="setting-group">
                                    <label>已添加城市</label>
                                    <div class="weather-city-list" id="weatherCityList">
                                        ${cityListHtml}
                                    </div>
                                </div>
                            </div>
                            <div class="setting-group" id="alertLevelGroup" style="display:none;">
                                <label>预警级别</label>
                                <div class="alert-level-row">
                                    <button type="button" class="alert-level-pill ${(settings.alertEnabledLevels || ['blue','yellow','orange','red']).includes('blue') ? 'active' : ''}" data-level="blue" style="--ac:#3b82f6;">蓝色</button>
                                    <button type="button" class="alert-level-pill ${(settings.alertEnabledLevels || ['blue','yellow','orange','red']).includes('yellow') ? 'active' : ''}" data-level="yellow" style="--ac:#eab308;">黄色</button>
                                    <button type="button" class="alert-level-pill ${(settings.alertEnabledLevels || ['blue','yellow','orange','red']).includes('orange') ? 'active' : ''}" data-level="orange" style="--ac:#f97316;">橙色</button>
                                    <button type="button" class="alert-level-pill ${(settings.alertEnabledLevels || ['blue','yellow','orange','red']).includes('red') ? 'active' : ''}" data-level="red" style="--ac:#ef4444;">红色</button>
                                </div>
                            </div>
                            <div class="setting-group">
                                <label for="weatherRefreshIntervalSelect">刷新频率</label>
                                <select id="weatherRefreshIntervalSelect" aria-label="天气刷新频率">${REFRESH_OPTIONS.map(o =>
                                    `<option value="${o.value}" ${settings.weatherRefreshInterval === o.value ? 'selected' : ''}>${o.label}</option>`
                                ).join('')}</select>
                                <small>设置为"不刷新"则仅首次加载，后续不再自动更新</small>
                            </div>
                            <div class="setting-group">
                                <label for="weatherRefreshModeSelect">刷新模式</label>
                                <select id="weatherRefreshModeSelect" aria-label="天气刷新模式">
                                    <option value="always" ${settings.weatherRefreshMode === 'foreground' ? '' : 'selected'}>始终刷新</option>
                                    <option value="foreground" ${settings.weatherRefreshMode === 'foreground' ? 'selected' : ''}>仅前台刷新</option>
                                </select>
                                <small>仅前台刷新：窗口在后台时暂停刷新，回到前台时立即刷新一次</small>
                            </div>
                        </div>
                    </div>
        `;
    },

    bind(ctx) {
        const { state, saveSettings, toast, escapeHtml, showModal,
                loadWeather, restartWeatherRefresh, searchCities,
                refilterAlerts } = ctx;
        const api = ctx.api;

        // ---- 天气 API 提供商切换 ----
        const weatherProviderSelect = document.getElementById('weatherProviderSelect');
        const qwStatusInline = document.getElementById('qwStatusInline');

        // 和风检测是否已通过（false=未配置/检测中/不可用，预警区此时应折叠）
        let qwDetectionPassed = false;

        function toggleWeatherProviderUI() {
            const isQweather = weatherProviderSelect.value === 'qweather';
            if (qwStatusInline) qwStatusInline.style.display = isQweather ? '' : 'none';
            // 预警区：仅在和风 provider 且检测通过时显示，其余一律折叠
            updateAlertVisibility();
        }

        weatherProviderSelect.addEventListener('change', async () => {
            const provider = weatherProviderSelect.value;
            toggleWeatherProviderUI();
            state.settings.weatherProvider = provider;
            await saveSettings();
            // 重新渲染城市列表（展示对应 provider 的城市）
            renderCityList();
            // 加载对应 provider 的第一个城市
            var first = getFirstCity();
            loadWeather(first);
            // 切到和风时自动检测（通过后自动展开城市/搜索区）
            if (provider === 'qweather') {
                collapseCitySection();
                await checkQweather();
            } else {
                setStatusUi('unk', '');
                expandCitySection();
            }
        });

        // ---- 和风天气 API 配置（弹窗）---- JWT 认证：Host + kid + sub + 私钥
        function openQweatherConfigDialog() {
            var host = state.settings.qweatherApiHost || '';
            var kid = state.settings.qweatherKid || '';
            var sub = state.settings.qweatherSub || '';
            // 私钥绝不回显明文：渲染层只拿到掩码（*configured*），输入框留空 = 保持原值
            var hasPriv = !!state.settings.qweatherPrivateKey;
            var html = '<h3>和风天气 API 配置（JWT 认证）</h3>' +
                '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:4px;">API Host</label>' +
                '<input type="text" id="qweatherConfigHost" placeholder="如 abc123.xyz.qweatherapi.com" value="' + escapeHtml(host) + '" />' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:4px;">凭据 ID（kid）</label>' +
                '<input type="text" id="qweatherConfigKid" placeholder="控制台-项目管理中的凭据 ID" value="' + escapeHtml(kid) + '" />' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:4px;">项目 ID（sub）</label>' +
                '<input type="text" id="qweatherConfigSub" placeholder="控制台-项目管理中的项目 ID" value="' + escapeHtml(sub) + '" />' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:4px;">Ed25519 私钥</label>' +
                (hasPriv
                    ? '<small style="color:var(--text-success);display:block;margin-bottom:4px;">✓ 已配置。输入框留空保持不变，如需更换请在下方粘贴新私钥。</small>'
                    : '') +
                '<textarea id="qweatherConfigPrivateKey" rows="3" placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----&#10;（留空=不修改已配置的私钥）" style="width:100%;resize:vertical;font-family:monospace;"></textarea>' +
                '<button class="btn btn-secondary" id="qweatherConfigGenKey" style="margin-top:8px;width:100%;">一键生成密钥对（私钥自动填入，公钥去和风登记）</button>' +
                '</div>' +
                '<small style="color:var(--text-muted);">和风现采用 JWT(Ed25519) 认证。请在 <a href="#" id="qweatherConsoleLink2" class="link-accent">console.qweather.com</a> 的"项目管理→添加凭据"中选择 JWT 身份认证，上传你生成的<strong>公钥</strong>；这里填写<strong>私钥</strong>、凭据 ID 与项目 ID。私钥仅在本机加密存储，不会明文回显或上传。</small>' +
                '<div class="dialog-btn-row" style="margin-top:16px;">' +
                '<button class="btn btn-secondary" id="qweatherConfigCancel">取消</button>' +
                '<button class="btn btn-primary" id="qweatherConfigSave">保存</button>' +
                '</div>';

            var modal = showModal(html, function () {
                // 关闭时不做额外操作
            }, { replace: false });

            var hostEl = modal.dialog.querySelector('#qweatherConfigHost');
            var kidEl = modal.dialog.querySelector('#qweatherConfigKid');
            var subEl = modal.dialog.querySelector('#qweatherConfigSub');
            var privEl = modal.dialog.querySelector('#qweatherConfigPrivateKey');

            modal.dialog.querySelector('#qweatherConfigCancel').addEventListener('click', function () {
                modal.close();
            });

            modal.dialog.querySelector('#qweatherConfigSave').addEventListener('click', async function () {
                state.settings.qweatherApiHost = hostEl.value.trim();
                state.settings.qweatherKid = kidEl.value.trim();
                state.settings.qweatherSub = subEl.value.trim();
                // 私钥：留空 = 保持原值（不再覆盖成空）；填写了才更新
                var newPriv = privEl.value.trim();
                if (newPriv) state.settings.qweatherPrivateKey = newPriv;
                await saveSettings();
                // 更新状态显示
                updateQweatherStatus();
                // 更新链接文字
                var link = document.getElementById('qweatherConfigLink');
                if (link) {
                    link.textContent = (state.settings.qweatherApiHost && state.settings.qweatherKid && state.settings.qweatherSub && state.settings.qweatherPrivateKey) ? '修改 API 配置' : '配置 API 认证';
                }
                modal.close();
                // 重新加载天气
                loadWeather(getFirstCity());
            });

            // 和风控制台链接
            var consoleLink = modal.dialog.querySelector('#qweatherConsoleLink2');
            if (consoleLink && api && api.openExternal) {
                consoleLink.addEventListener('click', function (e) {
                    e.preventDefault();
                    api.openExternal('https://console.qweather.com/project');
                });
            }

            // 一键生成密钥对：主进程生成本地 ed25519，私钥自动填入，公钥弹窗供复制登记
            var genKeyBtn = modal.dialog.querySelector('#qweatherConfigGenKey');
            if (genKeyBtn) {
                genKeyBtn.addEventListener('click', async function () {
                    genKeyBtn.disabled = true;
                    genKeyBtn.textContent = '正在生成...';
                    try {
                        const res = api && api.qweather && await api.qweather.genKeyPair();
                        if (!res || !res.ok) {
                            toast('生成失败：' + ((res && res.error) || '未知错误'));
                            return;
                        }
                        // 私钥自动填入输入框
                        privEl.value = res.privateKey.trim();
                        // 弹窗公钥，提示去和风控制台登记
                        var pubModal = showModal(
                            '<h3>已生成密钥对</h3>' +
                            '<p style="font-size:0.8rem;color:var(--text-muted);margin:0 0 8px;">' +
                            '私钥已自动填入上方输入框，请勿外传。<br/>' +
                            '请复制以下<b>公钥</b>，到和风控制台「项目管理 → 添加凭据 → JWT」上传登记，' +
                            '并填写控制台返回的 Host / 凭据 ID（kid）/ 项目 ID（sub）。</p>' +
                            '<textarea id="genKeyPublic" rows="5" readonly style="width:100%;font-family:monospace;font-size:0.78rem;resize:vertical;">' +
                            escapeHtml(res.publicKey.trim()) + '</textarea>' +
                            '<div class="dialog-btn-row" style="margin-top:12px;">' +
                            '<button class="btn btn-primary" id="genKeyCopied">已去登记，关闭</button>' +
                            '</div>',
                            function () { /* 关闭时无额外操作 */ },
                            { replace: false }
                        );
                        pubModal.dialog.querySelector('#genKeyCopied').addEventListener('click', function () {
                            pubModal.close();
                        });
                    } catch (e) {
                        console.error('密钥生成失败:', e);
                        toast('生成失败，请稍后重试');
                    } finally {
                        genKeyBtn.disabled = false;
                        genKeyBtn.textContent = '一键生成密钥对（私钥自动填入，公钥去和风登记）';
                    }
                });
            }
        }

        // ---- 和风 API 状态展示（内联在「天气 API」标题右侧）+ 可用性检测 ----
        function isQweatherConfigured() {
            return state.settings.qweatherApiHost && state.settings.qweatherKid &&
                state.settings.qweatherSub && state.settings.qweatherPrivateKey;
        }

        // 展开 / 折叠城市搜索 + 已添加城市区（贝塞尔曲线丝滑展开）
        function expandCitySection() {
            var sec = document.getElementById('weatherCitySection');
            if (!sec) return;
            sec.style.display = '';
            // 先确保有值可过渡：第一帧置当前高，第二帧过渡到目标高
            sec.style.maxHeight = '0px';
            sec.style.opacity = '1';
            requestAnimationFrame(function () {
                sec.style.maxHeight = sec.scrollHeight + 'px';
            });
            // 动画结束后解除固定高度，避免后续新增城市被裁剪（> 3 个时也能完整显示）
            setTimeout(function () {
                sec.style.maxHeight = 'none';
            }, 650);
        }

        function collapseCitySection() {
            var sec = document.getElementById('weatherCitySection');
            if (!sec) return;
            sec.style.maxHeight = 'none';        // 解除后取其真实高度用于收起
            void sec.offsetHeight;
            sec.style.maxHeight = sec.scrollHeight + 'px';
            void sec.offsetHeight;
            sec.style.maxHeight = '0px';
            sec.style.opacity = '0';
        }

        // 和风 provider 下，预警区仅在「检测通过」后才显示；未配置/检测中/不可用时一律折叠
        function updateAlertVisibility() {
            var alertGroup = document.getElementById('alertLevelGroup');
            if (!alertGroup) return;
            var isQweather = weatherProviderSelect && weatherProviderSelect.value === 'qweather';
            alertGroup.style.display = (isQweather && qwDetectionPassed) ? '' : 'none';
        }

        // mode: 'ok' | 'err' | 'loading' | 'unk'
        function setStatusUi(mode, text) {
            var dot = document.getElementById('qweatherStatusDot');
            var txt = document.getElementById('qweatherStatusText');
            var statusWrap = document.getElementById('qwStatusInline');
            if (!txt) return;
            updateAlertVisibility();
            if (mode === 'ok') {
                if (dot) { dot.className = ''; dot.style.background = '#1dc981'; }
                txt.textContent = text || '可用';
            } else if (mode === 'err') {
                if (dot) { dot.className = ''; dot.style.background = '#e8463a'; }
                txt.textContent = text || '不可用';
            } else if (mode === 'loading') {
                if (dot) { dot.className = 'qw-spinner'; dot.style.background = 'transparent'; }
                txt.textContent = text || '检测中…';
            } else {
                if (dot) { dot.className = ''; dot.style.background = '#9ca3af'; }
                txt.textContent = text || '';
            }
        }

        // 检测和风 API 可用性：发起一次实时天气请求（验证 Host/签名/凭据）。
        // 检测通过后自动展开城市搜索 / 已添加城市区。
        async function checkQweather() {
            var statusWrap = document.getElementById('qwStatusInline');
            if (statusWrap) statusWrap.style.display = '';
            if (!isQweatherConfigured()) {
                qwDetectionPassed = false;
                setStatusUi('unk', '未配置');
                collapseCitySection();
                return;
            }
            // 进入加载状态：圆环动画
            qwDetectionPassed = false;      // 检测中/未通过：预警区保持折叠
            setStatusUi('loading', '检测中…');
            // 取城市发起真实请求；若未添加城市，则用内置默认城市（北京）作为探测目标，
            // 仍能验证 Host / JWT 签名 / 凭据是否有效。
            var first = getFirstCity();
            try {
                var loc = (first && first.locationId) || '101010100'; // 默认探测城市：北京
                var getApi = api && api.qweather && api.qweather.get;
                var res = getApi ? await getApi({ endpoint: '/v7/weather/now', query: { location: loc } })
                                 : { ok: false, error: 'NO_CLIENT' };
                if (res && res.ok && res.data && res.data.code === '200') {
                    qwDetectionPassed = true;   // 检测通过：预警区才显示
                    setStatusUi('ok', '可用');
                    expandCitySection();   // 检测通过，丝滑展开城市区
                } else if (!res || !res.ok) {
                    var rerr = res && res.error ? res.error : '';
                    setStatusUi('err', '不可用 · ' + { NO_CONFIG: '未配置完整', NO_CLIENT: '组件未加载' }[rerr] || rerr || '请求失败');
                    collapseCitySection();
                } else {
                    setStatusUi('err', '返回异常 code=' + (res.data && res.data.code));
                    collapseCitySection();
                }
            } catch (e) {
                console.warn('[qweather] 可用性检测失败:', e);
                var reason = {
                    NO_CONFIG: '未配置完整',
                    PRIVATE_KEY_MISSING: '私钥缺失',
                    NO_CLIENT: '组件未加载',
                    UNKNOWN: '未知错误'
                }[e.message];
                setStatusUi('err', '不可用 · ' + (reason || e.message || '请求失败'));
                collapseCitySection();
            }
        }

        function updateQweatherStatus() {
            if (!isQweatherConfigured()) {
                setStatusUi('unk', '未配置');
                collapseCitySection();
                return;
            }
            // 配置完整：自动发起一次检测（通过则展开城市区）
            checkQweather();
        }

        document.getElementById('qweatherConfigLink').addEventListener('click', function (e) {
            e.preventDefault();
            openQweatherConfigDialog();
        });

        // 绑定初始化：若当前为和风且已配置，自动检测
        if (weatherProviderSelect.value === 'qweather' && isQweatherConfigured()) {
            updateQweatherStatus();
        }

        // ---- 城市搜索 ----
        const searchInput = document.getElementById('weatherSearchInput');
        const searchResults = document.getElementById('weatherSearchResults');
        let searchTimer = null;
        let searchSeq = 0;

        searchInput.addEventListener('input', function () {
            var kw = searchInput.value.trim();
            clearTimeout(searchTimer);
            if (!kw) {
                hideSearchResults();
                return;
            }
            searchTimer = setTimeout(function () {
                doSearch(kw);
            }, 400);
        });

        searchInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                var first = searchResults.querySelector('.weather-search-item');
                if (first) first.click();
            } else if (e.key === 'Escape') {
                hideSearchResults();
                searchInput.blur();
            }
        });

        document.addEventListener('click', function (e) {
            if (!e.target.closest('.weather-search-wrap')) {
                hideSearchResults();
            }
        });

        // ---- 搜索下拉显示/隐藏（复刻作业搜索微窗：spring 就地生长）----
        function showSearchResults() {
            searchResults.classList.add('qw-magic');
            // 第 1 帧：归零起点，为生长动画定格
            searchResults.style.display = 'block';
            searchResults.style.height = '0px';
            searchResults.style.opacity = '0';
            searchResults.style.overflow = 'hidden';
            // 第 2 帧：从 0 生长到内容高度（spring 缓动），透明度同步介入
            requestAnimationFrame(function () {
                var target = searchResults.scrollHeight;
                var cap = 240;                          // 与 CSS max-height 一致，超高则容器内滚动
                searchResults.style.height = Math.min(target, cap) + 'px';
                searchResults.style.opacity = '1';
                searchResults.style.overflow = (target > cap) ? 'auto' : 'hidden';
            });
            // 逐项错峰淡入（下落 + 清晰化）
            Array.prototype.forEach.call(searchResults.children, function (el) {
                el.style.opacity = '0';
                el.style.transform = 'translateY(5px)';
                el.style.transition = 'opacity .22s var(--transition-smooth), transform .3s var(--transition-spring)';
            });
            requestAnimationFrame(function () {
                Array.prototype.forEach.call(searchResults.children, function (el, i) {
                    el.style.transitionDelay = (90 + i * 35) + 'ms';
                });
            });
            // 下一帧让项过渡到原位
            requestAnimationFrame(function () {
                Array.prototype.forEach.call(searchResults.children, function (el) {
                    el.style.opacity = '1';
                    el.style.transform = 'translateY(0)';
                });
            });
        }

        function hideSearchResults() {
            searchResults.classList.remove('qw-magic');
            searchResults.style.height = '';
            searchResults.style.opacity = '';
            searchResults.style.overflow = '';
            // 还原项样式，供下次重复使用
            Array.prototype.forEach.call(searchResults.children, function (el) {
                el.style.opacity = '';
                el.style.transform = '';
                el.style.transition = '';
                el.style.transitionDelay = '';
            });
            searchResults.style.display = 'none';
        }

        async function doSearch(keyword) {
            var mySeq = ++searchSeq;
            try {
                var results = await searchCities(keyword);
                if (mySeq !== searchSeq) return;
                if (!results || results.length === 0) {
                    searchResults.innerHTML = '<div class="weather-search-empty">未找到"' + escapeHtml(keyword) + '"，请换个关键词试试</div>';
                    showSearchResults();
                    return;
                }
                renderSearchResults(results);
            } catch (err) {
                if (mySeq !== searchSeq) return;
                if (err.message === 'NO_CONFIG') {
                    searchResults.innerHTML = '<div class="weather-search-empty">请先配置和风天气 JWT（Host + kid/sub/私钥）</div>';
                    showSearchResults();
                    return;
                }
                searchResults.innerHTML = '<div class="weather-search-empty">搜索失败，请重试</div>';
                showSearchResults();
            }
        }

        function renderSearchResults(results) {
            searchResults.innerHTML = '';
            results.forEach(function (city) {
                var item = document.createElement('div');
                item.className = 'weather-search-item';
                var region = [city.country, city.admin1].filter(Boolean).join(' · ');
                item.innerHTML = '<span class="weather-search-item-name">' + escapeHtml(city.name) + '</span>' +
                    (region ? '<span class="weather-search-item-region">' + escapeHtml(region) + '</span>' : '');
                item.addEventListener('click', function () {
                    addCity(city);
                    hideSearchResults();
                    searchInput.value = '';
                });
                searchResults.appendChild(item);
            });
            showSearchResults();
        }

        function addCity(city) {
            var cities = _weatherCityList();
            // 避免重复添加（同 provider 同 id）
            var exists = cities.some(function (c) { return c.id === city.id; });
            if (exists) {
                toast('"' + city.name + '" 已在列表中');
                return;
            }
            // 只保留当前 provider 所需字段
            var provider = state.settings.weatherProvider || 'openmeteo';
            var entry;
            if (provider === 'qweather') {
                entry = { id: city.id, name: city.name, locationId: city.locationId, lat: city.lat, lon: city.lon, country: city.country || '', admin1: city.admin1 || '', timezone: city.timezone || 'auto' };
            } else {
                entry = { id: city.id, name: city.name, lat: city.lat, lon: city.lon, country: city.country || '', admin1: city.admin1 || '', timezone: city.timezone || 'auto' };
            }
            cities.push(entry);
            _weatherSetCityList(cities);
            saveSettings().then(function () {
                renderCityList();
                // 如果这是第一个城市，立即加载天气
                var first = getFirstCity();
                if (first && first.id === entry.id) {
                    loadWeather(entry);
                }
                toast('已添加 ' + entry.name);
            });
        }

        function getFirstCity() {
            var cities = _weatherCityList();
            return cities.length > 0 ? cities[0] : null;
        }

        // ---- 城市列表渲染 ----
        function renderCityList() {
            var container = document.getElementById('weatherCityList');
            if (!container) return;
            var cities = _weatherCityList();
            if (cities.length === 0) {
                container.innerHTML = '<div class="weather-city-empty">还没有添加城市，在上方搜索并添加</div>';
                return;
            }
            var html = cities.map(function (c, i) {
                var region = [c.country, c.admin1].filter(Boolean).join(' · ');
                return '<div class="weather-city-item" draggable="true" data-index="' + i + '">' +
                    '<span class="weather-city-drag">⠿</span>' +
                    '<span class="weather-city-name">' + escapeHtml(c.name) + '</span>' +
                    (region ? '<span class="weather-city-region">' + escapeHtml(region) + '</span>' : '') +
                    '<span class="weather-city-badge">' + (i === 0 ? '显示中' : '') + '</span>' +
                    '<button class="weather-city-del" data-index="' + i + '" title="移除">&times;</button>' +
                    '</div>';
            }).join('');
            container.innerHTML = html;

            // 绑定删除事件
            container.querySelectorAll('.weather-city-del').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var idx = parseInt(btn.dataset.index);
                    removeCity(idx);
                });
            });

            // 绑定拖拽事件
            container.querySelectorAll('.weather-city-item').forEach(function (item) {
                item.addEventListener('dragstart', onDragStart);
                item.addEventListener('dragover', onDragOver);
                item.addEventListener('drop', onDrop);
                item.addEventListener('dragend', onDragEnd);
            });
        }

        // ---- 删除城市 ----
        function removeCity(index) {
            var cities = _weatherCityList();
            if (index < 0 || index >= cities.length) return;
            var removed = cities[index];
            cities.splice(index, 1);
            _weatherSetCityList(cities);
            saveSettings().then(function () {
                renderCityList();
                var first = getFirstCity();
                loadWeather(first);
                toast('已移除 ' + removed.name);
            });
        }

        // ---- 拖拽排序 ----
        var dragSrcIndex = null;

        function onDragStart(e) {
            dragSrcIndex = parseInt(e.target.closest('.weather-city-item').dataset.index);
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', String(dragSrcIndex));
            var item = e.target.closest('.weather-city-item');
            setTimeout(function () { item.classList.add('weather-city-dragging'); }, 0);
        }

        function onDragOver(e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            document.querySelectorAll('.weather-city-dragover').forEach(function (el) {
                el.classList.remove('weather-city-dragover');
            });
            var target = e.target.closest('.weather-city-item');
            if (!target) return;
            var targetIndex = parseInt(target.dataset.index);
            if (targetIndex === dragSrcIndex) return;
            target.classList.add('weather-city-dragover');
        }

        function onDrop(e) {
            e.preventDefault();
            var dropTarget = e.target.closest('.weather-city-item');
            if (!dropTarget) return;
            var targetIndex = parseInt(dropTarget.dataset.index);
            if (targetIndex === dragSrcIndex || dragSrcIndex === null) return;

            var cities = _weatherCityList();
            var item = cities.splice(dragSrcIndex, 1)[0];
            cities.splice(targetIndex, 0, item);
            _weatherSetCityList(cities);
            dragSrcIndex = null;

            saveSettings().then(function () {
                renderCityList();
                var first = getFirstCity();
                if (first) loadWeather(first);
            });
        }

        function onDragEnd(e) {
            var item = e.target.closest('.weather-city-item');
            if (item) item.classList.remove('weather-city-dragging');
            document.querySelectorAll('.weather-city-dragover').forEach(function (el) {
                el.classList.remove('weather-city-dragover');
            });
            dragSrcIndex = null;
        }

        // ---- 预警级别筛选（色块 pill：点击切换选中态，醒目排开不换行）----
        document.querySelectorAll('.alert-level-pill').forEach(function (pill) {
            pill.addEventListener('click', async function () {
                pill.classList.toggle('active');
                var levels = Array.from(document.querySelectorAll('.alert-level-pill'))
                    .filter(function (p) { return p.classList.contains('active'); })
                    .map(function (p) { return p.dataset.level; });
                state.settings.alertEnabledLevels = levels;
                await saveSettings();
                refilterAlerts();
            });
        });

        // ---- 天气刷新频率 ----
        const weatherRefreshIntervalSelect = document.getElementById('weatherRefreshIntervalSelect');
        weatherRefreshIntervalSelect.addEventListener('change', async () => {
            const interval = parseInt(weatherRefreshIntervalSelect.value);
            state.settings.weatherRefreshInterval = interval;
            await saveSettings();
            restartWeatherRefresh();
        });

        // ---- 天气刷新模式 ----
        const weatherRefreshModeSelect = document.getElementById('weatherRefreshModeSelect');
        weatherRefreshModeSelect.addEventListener('change', async () => {
            state.settings.weatherRefreshMode = weatherRefreshModeSelect.value;
            await saveSettings();
            restartWeatherRefresh();
        });
    }
};