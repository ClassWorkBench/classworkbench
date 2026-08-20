// ============================================
// weather.js
// 天气加载：支持 Open-Meteo 和 和风天气 双 API
// 根据 settings.weatherProvider 自动切换
// 支持定时刷新和前台/后台刷新模式
// ============================================

(function () {
    const { weatherCodeDict, qweatherIconMap, GEOCODING_URL } = window.AppConfig;
    const state = window.AppState;
    const { toast } = window.AppUtils;

    const WEATHER_CACHE_KEY = 'weather_cache';
    // 缓存有效期 30 分钟；超过则视为过期，离线兜底场景下仍会使用
    const CACHE_TTL = 30 * 60 * 1000;

    let weatherFetching = false;
    let refreshTimer = null;
    let lastRefreshTime = 0;
    let visibilityHandler = null;

    const weatherDisplay = () => state.dom.weatherDisplay();
    const areaNameEl = () => state.dom.weatherAreaName();
    const emojiEl = () => state.dom.weatherEmoji();
    const tempEl = () => state.dom.weatherTemp();
    const descEl = () => state.dom.weatherDesc();

    // ---- 离线缓存 ----
    function saveCache(data) {
        try {
            localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({ ...data, ts: Date.now() }));
        } catch (e) {
            console.warn('天气缓存写入失败:', e);
        }
    }

    function loadCache() {
        try {
            const raw = localStorage.getItem(WEATHER_CACHE_KEY);
            if (!raw) return null;
            const cache = JSON.parse(raw);
            if (typeof cache.ts !== 'number') return null;
            return cache;
        } catch (e) {
            return null;
        }
    }

    function applyCacheUI(cache, suffix = '') {
        areaNameEl().textContent = cache.areaName || '--';
        emojiEl().innerHTML = emoji(cache.emoji || '⚠️');
        tempEl().textContent = (cache.temp != null ? cache.temp : '--') + '°C';
        descEl().textContent = (cache.desc || '--') + suffix;
    }

    // ---- 显示加载状态 ----
    function setLoading() {
        weatherDisplay().classList.add('loading');
    }

    function clearLoading() {
        weatherDisplay().classList.remove('loading');
    }

    // ============================================
    // 城市搜索（Open-Meteo Geocoding API）
    // ============================================
    let _searchSeq = 0;

    async function searchCitiesOpenMeteo(keyword) {
        const seq = ++_searchSeq;
        var params = new URLSearchParams({
            name: keyword,
            count: '10',
            language: 'zh',
            format: 'json'
        });
        var resp = await fetch(GEOCODING_URL + '?' + params.toString());
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        var data = await resp.json();
        if (seq !== _searchSeq) return null;
        var results = (data.results || []).filter(function (loc) {
            return !loc.feature_code || loc.feature_code.startsWith('PPL');
        });
        return results.map(function (loc) {
            return {
                id: 'om_' + loc.id,
                name: loc.name,
                provider: 'openmeteo',
                lat: loc.latitude,
                lon: loc.longitude,
                country: loc.country || '',
                admin1: loc.admin1 || '',
                timezone: loc.timezone || 'auto'
            };
        });
    }

    // ============================================
    // 城市搜索（和风天气 GeoAPI）
    // ============================================
    async function searchCitiesQweather(keyword) {
        var data = await qweatherFetch('/geo/v2/city/lookup', { location: keyword, number: 8 });
        if (data.code !== '200' || !data.location || data.location.length === 0) {
            return [];
        }
        return data.location.map(function (loc) {
            return {
                id: 'qw_' + loc.id,
                name: loc.name,
                provider: 'qweather',
                locationId: loc.id,
                lat: loc.lat,
                lon: loc.lon,
                country: loc.country || '',
                admin1: loc.adm1 || '',
                timezone: loc.tz || 'auto'
            };
        });
    }

    /** 统一城市搜索入口，根据当前 provider 自动分发 */
    async function searchCities(keyword) {
        var provider = state.settings.weatherProvider || 'openmeteo';
        if (provider === 'qweather') {
            return searchCitiesQweather(keyword);
        }
        return searchCitiesOpenMeteo(keyword);
    }

    // ============================================
    // Open-Meteo 实现
    // ============================================
    async function loadOpenMeteo(city) {
        if (!city || !city.lat || !city.lon) {
            clearLoading();
            return;
        }

        var apiUrl = 'https://api.open-meteo.com/v1/forecast?latitude=' + city.lat + '&longitude=' + city.lon + '&current=temperature_2m,weather_code&timezone=Asia%2FShanghai';

        try {
            var res = await fetch(apiUrl);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            var data = await res.json();
            var current = data.current;
            var temp = Math.round(current.temperature_2m);
            var code = current.weather_code;
            var info = weatherCodeDict[code] || weatherCodeDict[0];

            areaNameEl().textContent = city.name;
            emojiEl().innerHTML = emoji(info.emoji);
            tempEl().textContent = temp + '°C';
            descEl().textContent = info.text;
            clearLoading();

            saveCache({
                temp: temp,
                areaName: city.name,
                emoji: info.emoji,
                desc: info.text,
                provider: 'openmeteo'
            });
        } catch (err) {
            console.error('Open-Meteo 天气加载失败:', err);
            handleFallback(city.name, err);
        }
    }

    // ============================================
    // 和风天气实现
    // ============================================
    async function qweatherFetch(endpoint, params, loc) {
        // JWT 认证：委托主进程签名并请求，渲染层不接触私钥。
        // 配置缺失时主进程返回 NO_CONFIG；HTTP 层错误（403 等）原样抛给调用方。
        // loc 可选：{ lat, lon }，用于 endpoint 中的 {lat}/{lon} 占位替换（新版 weatheralert 按经纬度）。
        const api = window.electronAPI && window.electronAPI.qweather;
        if (!api) throw new Error('NO_CLIENT');
        const res = await api.get({ endpoint, query: params, lat: loc && loc.lat, lon: loc && loc.lon });
        if (!res || !res.ok) {
            throw new Error(res && res.error ? res.error : 'HTTP 请求失败');
        }
        return res.data;
    }

    async function loadQweather(city) {
        if (!city || !city.locationId) {
            clearLoading();
            areaNameEl().textContent = '--';
            emojiEl().innerHTML = emoji('⚠️');
            tempEl().textContent = '--°C';
            descEl().textContent = '未选择城市';
            return;
        }

        try {
            var data = await qweatherFetch('/v7/weather/now', { location: city.locationId });

            if (data.code !== '200') {
                throw new Error('API 返回 code: ' + data.code);
            }

            var now = data.now;
            var iconInfo = qweatherIconMap[parseInt(now.icon)] || { emoji: '🌈', text: now.text || '未知' };
            var temp = Math.round(parseFloat(now.temp));

            areaNameEl().textContent = city.name;
            emojiEl().innerHTML = emoji(iconInfo.emoji);
            tempEl().textContent = temp + '°C';
            descEl().textContent = iconInfo.text;
            clearLoading();

            saveCache({
                temp: temp,
                areaName: city.name,
                emoji: iconInfo.emoji,
                desc: iconInfo.text,
                provider: 'qweather'
            });
        } catch (err) {
            console.error('和风天气加载失败:', err);
            if (err.message === 'NO_CONFIG') {
                clearLoading();
                areaNameEl().textContent = '--';
                emojiEl().innerHTML = emoji('⚠️');
                tempEl().textContent = '--°C';
                descEl().textContent = '未配置 API';
                toast('请先在设置中配置和风天气 JWT（Host + kid/sub/私钥）');
                return;
            }
            handleFallback(city.name, err);
        }
    }

    // ============================================
    // 天气预警（仅和风天气支持）
    // ============================================
    var ALERT_LEVEL_ORDER = { red: 4, orange: 3, yellow: 2, blue: 1 };

    /** 把归一化级别转成显示用中文（新版 weatheralert 用 color.code，旧版用中文 levelStr） */
    function levelLabel(level) {
        var map = { red: '红色', orange: '橙色', yellow: '黄色', blue: '蓝色', unknown: '' };
        return map[level] || '';
    }
    var ALERT_LEVEL_COLORS = {
        blue:   { bg: 'rgba(59,130,246,0.14)',  border: 'rgba(59,130,246,0.35)',  dot: '#3b82f6', text: '#1e40af' },
        yellow: { bg: 'rgba(234,179,8,0.16)',   border: 'rgba(234,179,8,0.38)',   dot: '#eab308', text: '#854d0e' },
        orange: { bg: 'rgba(249,115,22,0.16)',  border: 'rgba(249,115,22,0.38)',  dot: '#f97316', text: '#9a3412' },
        red:    { bg: 'rgba(239,68,68,0.16)',   border: 'rgba(239,68,68,0.38)',   dot: '#ef4444', text: '#991b1b' }
    };

    var lastRawAlerts = [];

    var alertCapsuleEl = function () { return state.dom.alertCapsule(); };
    var alertDotEl     = function () { return state.dom.alertDot(); };
    var alertTextEl    = function () { return state.dom.alertText(); };
    var alertCountEl   = function () { return state.dom.alertCount(); };

    function normalizeAlertLevel(alert) {
        // 新版 weatheralert：颜色取 color.code（支持 blue/yellow/amber/orange/red 等）
        if (alert.color && typeof alert.color.code === 'string') {
            var cci = alert.color.code.toLowerCase();
            if (cci.indexOf('red') >= 0) return 'red';
            if (cci.indexOf('orange') >= 0) return 'orange';
            if (cci.indexOf('amber') >= 0 || cci.indexOf('yellow') >= 0) return 'yellow';
            if (cci.indexOf('blue') >= 0) return 'blue';
            return 'unknown';
        }
        // 旧版 v7：severityColor / level 兼容
        var sc = (alert.severityColor || '').toLowerCase();
        if (sc.indexOf('blue') >= 0) return 'blue';
        if (sc.indexOf('yellow') >= 0) return 'yellow';
        if (sc.indexOf('orange') >= 0) return 'orange';
        if (sc.indexOf('red') >= 0) return 'red';
        var lv = alert.level || '';
        if (lv.indexOf('\u84dd') >= 0) return 'blue';
        if (lv.indexOf('\u9ec4') >= 0) return 'yellow';
        if (lv.indexOf('\u6a59') >= 0) return 'orange';
        if (lv.indexOf('\u7ea2') >= 0) return 'red';
        return 'unknown';
    }

    function getFilteredAlerts(alerts) {
        var enabled = state.settings.alertEnabledLevels || ['blue', 'yellow', 'orange', 'red'];
        return alerts.filter(function (a) {
            var level = normalizeAlertLevel(a);
            return level === 'unknown' || enabled.indexOf(level) >= 0;
        });
    }

    async function fetchQweatherAlerts() {
        var firstCity = getFirstCity();
        if (!firstCity) return [];
        // 新版预警按经纬度查询，旧数据若缺经纬度则无法获取（需在设置中重新搜索添加城市）
        if (firstCity.lat == null || firstCity.lon == null) {
            return [];
        }
        try {
            var res = await qweatherFetch('/weatheralert/v1/current/{lat}/{lon}', null, {
                lat: firstCity.lat,
                lon: firstCity.lon
            });
            return (res && Array.isArray(res.alerts)) ? res.alerts : [];
        } catch (err) {
            console.warn('天气预警获取失败:', err);
            return [];
        }
    }

    function renderAlertCapsule(filteredAlerts) {
        var capsule = alertCapsuleEl();
        if (!capsule) return;

        if (filteredAlerts.length === 0) {
            capsule.style.display = 'none';
            return;
        }

        var sorted = filteredAlerts.slice().sort(function (a, b) {
            var la = ALERT_LEVEL_ORDER[normalizeAlertLevel(a)] || 0;
            var lb = ALERT_LEVEL_ORDER[normalizeAlertLevel(b)] || 0;
            return lb - la;
        });

        var top = sorted[0];
        var level = normalizeAlertLevel(top);
        var c = ALERT_LEVEL_COLORS[level] || ALERT_LEVEL_COLORS.yellow;

        capsule.style.display = '';
        capsule.style.background = c.bg;
        capsule.style.borderColor = c.border;

        var dot = alertDotEl();
        if (dot) dot.style.background = c.dot;

        var txt = alertTextEl();
        if (txt) {
            var typeName = (top.eventType && top.eventType.name) || top.typeName || top.type || '天气';
            txt.textContent = '\u26A0\uFE0F ' + typeName + levelLabel(level) + '预警';
            txt.style.color = c.text;
        }

        var cnt = alertCountEl();
        if (cnt) {
            if (sorted.length > 1) {
                cnt.style.display = '';
                cnt.textContent = '+' + (sorted.length - 1);
            } else {
                cnt.style.display = 'none';
            }
        }

        capsule._sortedAlerts = sorted;

        if (!capsule._alertClickBound) {
            capsule._alertClickBound = true;
            capsule.addEventListener('click', function () {
                if (capsule._sortedAlerts && capsule._sortedAlerts.length > 0) {
                    showAlertDetail(capsule._sortedAlerts);
                }
            });
            capsule.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (capsule._sortedAlerts && capsule._sortedAlerts.length > 0) {
                        showAlertDetail(capsule._sortedAlerts);
                    }
                }
            });
        }
    }

    function showAlertDetail(sortedAlerts) {
        var showModal = window.AppModal ? window.AppModal.showModal : null;
        var escapeHtml = window.AppUtils ? window.AppUtils.escapeHtml : null;
        if (!showModal || !escapeHtml) return;

        function fmtTime(iso) {
            if (!iso) return '';
            try {
                return new Date(iso).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            } catch (_) { return iso; }
        }

        var cardsHtml = sortedAlerts.map(function (alert) {
            var level = normalizeAlertLevel(alert);
            var c = ALERT_LEVEL_COLORS[level] || ALERT_LEVEL_COLORS.yellow;
            var typeName = (alert.eventType && alert.eventType.name) || alert.typeName || alert.type || '天气预警';
            var levelStr = levelLabel(level) || (alert.level || '');
            var sender = alert.senderName || alert.sender || '';
            // 新版用 effectiveTime（生效）/ onsetTime（开始）/ expireTime（失效）；旧版 pubTime/startTime/endTime
            var pubTime = fmtTime(alert.effectiveTime || alert.pubTime || alert.issuedTime);
            var startTime = fmtTime(alert.onsetTime || alert.startTime);
            var endTime = fmtTime(alert.expireTime || alert.endTime);
            var text = alert.description || alert.text || alert.headline || '';

            return '<div style="background:' + c.bg + ';border-left:4px solid ' + c.dot + ';border-radius:12px;padding:14px 16px;margin-bottom:10px;">' +
                '<div style="font-weight:700;font-size:1rem;color:' + c.text + ';margin-bottom:6px;">' + escapeHtml(typeName) + (levelStr ? ' ' + escapeHtml(levelStr) + '预警' : '预警') + '</div>' +
                (sender ? '<div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:3px;">\uD83D\uDCE2 ' + escapeHtml(sender) + '</div>' : '') +
                (pubTime ? '<div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:3px;">\uD83D\uDD50 生效于 ' + escapeHtml(pubTime) + '</div>' : '') +
                ((startTime || endTime) ? '<div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:8px;">\u23F1 ' + escapeHtml(startTime) + ' ~ ' + escapeHtml(endTime) + '</div>' : '') +
                (text ? '<div style="font-size:0.86rem;line-height:1.6;color:var(--text-primary);white-space:pre-wrap;">' + escapeHtml(text) + '</div>' : '') +
                '</div>';
        }).join('');

        var html = '<h3>\u26A0\uFE0F 天气预警</h3>' +
            '<div style="max-height:56vh;overflow-y:auto;">' + cardsHtml + '</div>' +
            '<div style="display:flex;justify-content:center;"><button class="btn" id="alertCloseBtn">关闭</button></div>';

        var result = showModal(html);
        var btn = document.getElementById('alertCloseBtn');
        if (btn) btn.addEventListener('click', result.close);
    }

    async function refreshAlerts() {
        var provider = state.settings.weatherProvider || 'openmeteo';
        if (provider !== 'qweather') {
            var capsule = alertCapsuleEl();
            if (capsule) capsule.style.display = 'none';
            lastRawAlerts = [];
            return;
        }
        lastRawAlerts = await fetchQweatherAlerts();
        renderAlertCapsule(getFilteredAlerts(lastRawAlerts));
    }

    function refilterAlerts() {
        renderAlertCapsule(getFilteredAlerts(lastRawAlerts));
    }

    // ---- 离线兜底 ----
    function handleFallback(locationName, err) {
        const cache = loadCache();
        if (cache) {
            const expired = (Date.now() - cache.ts) > CACHE_TTL;
            if (expired) console.warn('天气缓存已过期，作为离线兜底使用');
            applyCacheUI(cache, expired ? '（离线）' : '');
            clearLoading();
            return;
        }

        areaNameEl().textContent = locationName || '--';
        emojiEl().innerHTML = emoji('⚠️');
        tempEl().textContent = '--°C';
        descEl().textContent = '加载失败';
        clearLoading();
        toast('天气加载失败');
    }

    // ============================================
    // 公共入口：根据 settings.weatherProvider 分发
    // ============================================
    async function loadWeather(city) {
        if (weatherFetching) return;
        weatherFetching = true;
        setLoading();

        // 没有城市时清空显示
        if (!city) {
            areaNameEl().textContent = '--';
            emojiEl().textContent = '--';
            tempEl().textContent = '--°C';
            descEl().textContent = '--';
            clearLoading();
            weatherFetching = false;
            var capsule = alertCapsuleEl();
            if (capsule) capsule.style.display = 'none';
            return;
        }

        try {
            const provider = city.provider || state.settings.weatherProvider || 'openmeteo';
            if (provider === 'qweather') {
                await loadQweather(city);
            } else {
                await loadOpenMeteo(city);
            }
            lastRefreshTime = Date.now();
            // 预警数据与天气同步刷新（非阻塞）
            refreshAlerts();
        } finally {
            weatherFetching = false;
        }
    }

    // ============================================
    // 定时刷新管理
    // ============================================
    function clearRefreshTimer() {
        if (refreshTimer) {
            clearInterval(refreshTimer);
            refreshTimer = null;
        }
    }

    function getFirstCity() {
        var provider = state.settings.weatherProvider || 'openmeteo';
        if (provider === 'qweather') {
            var qc = state.settings.qweatherCities || [];
            return qc.length > 0 ? qc[0] : null;
        }
        var om = state.settings.openmeteoCities || [];
        return om.length > 0 ? om[0] : null;
    }

    function startRefreshTimer() {
        clearRefreshTimer();
        const intervalMin = state.settings.weatherRefreshInterval;
        if (!intervalMin || intervalMin <= 0) return;

        const intervalMs = intervalMin * 60 * 1000;
        refreshTimer = setInterval(() => {
            const mode = state.settings.weatherRefreshMode || 'always';
            if (mode === 'foreground' && document.hidden) {
                // 后台不刷新，等回到前台时再刷新
                return;
            }
            var first = getFirstCity();
            if (first) loadWeather(first);
        }, intervalMs);
    }

    function setupWeatherRefresh() {
        // 先清理旧的
        cleanupWeatherRefresh();

        // 启动定时器
        startRefreshTimer();

        // 监听 visibilitychange：从后台回到前台时
        visibilityHandler = () => {
            if (document.hidden) return;
            const mode = state.settings.weatherRefreshMode || 'always';
            if (mode !== 'foreground') return;

            const intervalMin = state.settings.weatherRefreshInterval;
            if (!intervalMin || intervalMin <= 0) return;

            const elapsed = Date.now() - lastRefreshTime;
            const intervalMs = intervalMin * 60 * 1000;
            if (elapsed >= intervalMs) {
                var first = getFirstCity();
                if (first) loadWeather(first);
            }
        };
        document.addEventListener('visibilitychange', visibilityHandler);
    }

    function cleanupWeatherRefresh() {
        clearRefreshTimer();
        if (visibilityHandler) {
            document.removeEventListener('visibilitychange', visibilityHandler);
            visibilityHandler = null;
        }
    }

    // 重启定时器（设置变更后调用）
    function restartWeatherRefresh() {
        cleanupWeatherRefresh();
        setupWeatherRefresh();
    }

    window.AppWeather = {
        loadWeather,
        searchCities,
        setupWeatherRefresh,
        cleanupWeatherRefresh,
        restartWeatherRefresh,
        refreshAlerts,
        refilterAlerts
    };
})();
