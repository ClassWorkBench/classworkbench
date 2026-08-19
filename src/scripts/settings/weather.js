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
                            <div class="setting-group">
                                <label for="weatherProviderSelect">天气 API</label>
                                <select id="weatherProviderSelect" aria-label="选择天气数据来源">
                                    <option value="openmeteo" ${settings.weatherProvider === 'qweather' ? '' : 'selected'}>Open-Meteo（免费，简单）</option>
                                    <option value="qweather" ${settings.weatherProvider === 'qweather' ? 'selected' : ''}>和风天气（需配置 API）</option>
                                </select>
                                <small>和风天气需自行申请 API Key — <a href="#" id="qweatherConfigLink" class="link-accent">${settings.qweatherApiHost && settings.qweatherApiKey ? '修改 API 配置' : '配置 API 密钥'}</a></small>
                            </div>
                            <div class="setting-group" id="qweatherStatusGroup" ${settings.weatherProvider === 'qweather' ? '' : 'style="display:none;"'}>
                                <label>和风 API 状态</label>
                                <div style="font-size:0.85rem;color:var(--text-secondary);">${settings.qweatherApiHost && settings.qweatherApiKey ? '已配置' : '未配置，请点击上方链接配置'}</div>
                            </div>
                            <div class="setting-group" id="alertLevelGroup" ${settings.weatherProvider === 'qweather' ? '' : 'style="display:none;"'}>
                                <label>预警级别筛选</label>
                                <div class="alert-level-checkboxes">
                                    <label class="alert-level-option"><input type="checkbox" class="alert-level-cb" data-level="blue" ${(settings.alertEnabledLevels || ['blue','yellow','orange','red']).includes('blue') ? 'checked' : ''}><span class="alert-level-dot" style="background:#3b82f6;"></span>蓝色</label>
                                    <label class="alert-level-option"><input type="checkbox" class="alert-level-cb" data-level="yellow" ${(settings.alertEnabledLevels || ['blue','yellow','orange','red']).includes('yellow') ? 'checked' : ''}><span class="alert-level-dot" style="background:#eab308;"></span>黄色</label>
                                    <label class="alert-level-option"><input type="checkbox" class="alert-level-cb" data-level="orange" ${(settings.alertEnabledLevels || ['blue','yellow','orange','red']).includes('orange') ? 'checked' : ''}><span class="alert-level-dot" style="background:#f97316;"></span>橙色</label>
                                    <label class="alert-level-option"><input type="checkbox" class="alert-level-cb" data-level="red" ${(settings.alertEnabledLevels || ['blue','yellow','orange','red']).includes('red') ? 'checked' : ''}><span class="alert-level-dot" style="background:#ef4444;"></span>红色</label>
                                </div>
                            </div>
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
        const qweatherConfigGroup = document.getElementById('qweatherStatusGroup');

        function toggleWeatherProviderUI() {
            const isQweather = weatherProviderSelect.value === 'qweather';
            qweatherConfigGroup.style.display = isQweather ? '' : 'none';
            var alertLevelGroup = document.getElementById('alertLevelGroup');
            if (alertLevelGroup) alertLevelGroup.style.display = isQweather ? '' : 'none';
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
        });

        // ---- 和风天气 API 配置（弹窗） ----
        function openQweatherConfigDialog() {
            var host = state.settings.qweatherApiHost || '';
            var key = state.settings.qweatherApiKey || '';
            var html = '<h3>和风天气 API 配置</h3>' +
                '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:4px;">API Host</label>' +
                '<input type="text" id="qweatherConfigHost" placeholder="如 abc123.xyz.qweatherapi.com" value="' + escapeHtml(host) + '" />' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:4px;">API Key</label>' +
                '<input type="password" id="qweatherConfigKey" placeholder="输入你的 API Key" value="' + escapeHtml(key) + '" />' +
                '</div>' +
                '<small style="color:var(--text-muted);">在 <a href="#" id="qweatherConsoleLink2" class="link-accent">console.qweather.com</a> 查看专属 API Host 和创建 Key</small>' +
                '<div class="dialog-btn-row" style="margin-top:16px;">' +
                '<button class="btn btn-secondary" id="qweatherConfigCancel">取消</button>' +
                '<button class="btn btn-primary" id="qweatherConfigSave">保存</button>' +
                '</div>';

            var modal = showModal(html, function () {
                // 关闭时不做额外操作
            }, { replace: false });

            var hostEl = modal.dialog.querySelector('#qweatherConfigHost');
            var keyEl = modal.dialog.querySelector('#qweatherConfigKey');

            modal.dialog.querySelector('#qweatherConfigCancel').addEventListener('click', function () {
                modal.close();
            });

            modal.dialog.querySelector('#qweatherConfigSave').addEventListener('click', async function () {
                state.settings.qweatherApiHost = hostEl.value.trim();
                state.settings.qweatherApiKey = keyEl.value.trim();
                await saveSettings();
                // 更新状态显示
                updateQweatherStatus();
                // 更新链接文字
                var link = document.getElementById('qweatherConfigLink');
                if (link) {
                    link.textContent = (state.settings.qweatherApiHost && state.settings.qweatherApiKey) ? '修改 API 配置' : '配置 API 密钥';
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
                    api.openExternal('https://console.qweather.com/setting');
                });
            }
        }

        function updateQweatherStatus() {
            var statusGroup = document.getElementById('qweatherStatusGroup');
            if (!statusGroup) return;
            var configured = state.settings.qweatherApiHost && state.settings.qweatherApiKey;
            var div = statusGroup.querySelector('div');
            if (div) {
                div.textContent = configured ? '已配置' : '未配置，请点击上方链接配置';
            }
        }

        document.getElementById('qweatherConfigLink').addEventListener('click', function (e) {
            e.preventDefault();
            openQweatherConfigDialog();
        });

        // ---- 城市搜索 ----
        const searchInput = document.getElementById('weatherSearchInput');
        const searchResults = document.getElementById('weatherSearchResults');
        let searchTimer = null;
        let searchSeq = 0;

        searchInput.addEventListener('input', function () {
            var kw = searchInput.value.trim();
            clearTimeout(searchTimer);
            if (!kw) {
                searchResults.style.display = 'none';
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
                searchResults.style.display = 'none';
                searchInput.blur();
            }
        });

        document.addEventListener('click', function (e) {
            if (!e.target.closest('.weather-search-wrap')) {
                searchResults.style.display = 'none';
            }
        });

        async function doSearch(keyword) {
            var mySeq = ++searchSeq;
            try {
                var results = await searchCities(keyword);
                if (mySeq !== searchSeq) return;
                if (!results || results.length === 0) {
                    searchResults.innerHTML = '<div class="weather-search-empty">未找到"' + escapeHtml(keyword) + '"，请换个关键词试试</div>';
                    searchResults.style.display = 'block';
                    return;
                }
                renderSearchResults(results);
            } catch (err) {
                if (mySeq !== searchSeq) return;
                if (err.message === 'NO_CONFIG') {
                    searchResults.innerHTML = '<div class="weather-search-empty">请先配置和风天气 API Host 和 Key</div>';
                    searchResults.style.display = 'block';
                    return;
                }
                searchResults.innerHTML = '<div class="weather-search-empty">搜索失败，请重试</div>';
                searchResults.style.display = 'block';
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
                    searchResults.style.display = 'none';
                    searchInput.value = '';
                });
                searchResults.appendChild(item);
            });
            searchResults.style.display = 'block';
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
                entry = { id: city.id, name: city.name, locationId: city.locationId, country: city.country || '', admin1: city.admin1 || '', timezone: city.timezone || 'auto' };
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

        // ---- 预警级别筛选 ----
        document.querySelectorAll('.alert-level-cb').forEach(function (cb) {
            cb.addEventListener('change', async function () {
                var levels = Array.from(document.querySelectorAll('.alert-level-cb'))
                    .filter(function (c) { return c.checked; })
                    .map(function (c) { return c.dataset.level; });
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