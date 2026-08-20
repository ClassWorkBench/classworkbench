// ============================================
// storage.js
// 数据加载与持久化 —— 通过 IPC 调用主进程的 electron-store
// ============================================

(function () {
    const { DEFAULT_SUBJECTS } = window.AppConfig;
    const state = window.AppState;
    const { toast } = window.AppUtils;
    const api = window.electronAPI;

    // 是否首次安装（loadAll 后有效）：磁盘上无 settings 记录
    let isFreshInstall = false;

    async function loadAll() {
        try {
            const data = await api.loadData();
            // 全新安装检测：磁盘上没有任何 settings 记录 → 首次使用，走完整设置向导；
            // 老用户（有 settings 但没走过向导）只弹协议确认。供向导（wizard.js）判断。
            isFreshInstall = (data.settings == null);
            state.homeworks = data.homeworks || [];
            if (data.settings) Object.assign(state.settings, data.settings);
            state.subjectList = data.subjects || [...DEFAULT_SUBJECTS];
            if (state.subjectList.length === 0) state.subjectList = [...DEFAULT_SUBJECTS];
            state.subjectList.forEach(s => { if (!s.color) s.color = '#5b6abf'; });
            if (!state.settings.weatherProvider) state.settings.weatherProvider = 'openmeteo';
            if (state.settings.weatherRefreshInterval === undefined) state.settings.weatherRefreshInterval = 30;
            if (!state.settings.weatherRefreshMode) state.settings.weatherRefreshMode = 'always';
            if (state.settings.qweatherApiHost === undefined) state.settings.qweatherApiHost = '';
            if (state.settings.qweatherApiKey === undefined) state.settings.qweatherApiKey = '';
            // 和风 JWT 认证字段兜底（v1.x 迁移新增）
            if (state.settings.qweatherKid === undefined) state.settings.qweatherKid = '';
            if (state.settings.qweatherSub === undefined) state.settings.qweatherSub = '';
            if (state.settings.qweatherPrivateKey === undefined) state.settings.qweatherPrivateKey = '';
            // 旧版 weatherCities → openmeteoCities / qweatherCities 迁移
            if (Array.isArray(state.settings.weatherCities) && state.settings.weatherCities.length > 0) {
                var om = [];
                var qw = [];
                state.settings.weatherCities.forEach(function (c) {
                    if (c.provider === 'qweather') {
                        qw.push({ id: c.id, name: c.name, locationId: c.locationId || c.id.replace('qw_',''), country: c.country || '', admin1: c.admin1 || '', timezone: c.timezone || 'auto' });
                    } else {
                        om.push({ id: c.id, name: c.name, lat: c.lat, lon: c.lon, country: c.country || '', admin1: c.admin1 || '', timezone: c.timezone || 'auto' });
                    }
                });
                if (om.length > 0) state.settings.openmeteoCities = om;
                if (qw.length > 0) state.settings.qweatherCities = qw;
            }
            if (!Array.isArray(state.settings.openmeteoCities)) state.settings.openmeteoCities = [];
            if (!Array.isArray(state.settings.qweatherCities)) state.settings.qweatherCities = [];
            // 清理旧字段
            delete state.settings.weatherArea;
            delete state.settings.qweatherCityId;
            delete state.settings.weatherCities;
            if (state.settings.bgRefreshInterval === undefined) state.settings.bgRefreshInterval = 30;
            if (state.settings.bgSource === undefined) state.settings.bgSource = 'upx8';
            if (!state.settings.bgRefreshMode) state.settings.bgRefreshMode = 'always';
            if (state.settings.cardColumns === undefined) state.settings.cardColumns = 3;
            // 视觉效果兜底
            if (state.settings.blurBars === undefined) state.settings.blurBars = true;
            if (state.settings.blurCard === undefined) state.settings.blurCard = true;
            if (state.settings.blurModal === undefined) state.settings.blurModal = true;
            if (state.settings.reduceAnimation === undefined) state.settings.reduceAnimation = false;
            // qq 配置兜底（旧 settings 无此字段时填充默认）
            if (!state.settings.qq) state.settings.qq = {};
            const q = state.settings.qq;
            if (q.enabled === undefined) q.enabled = false;
            if (!Array.isArray(q.teachers)) q.teachers = [];
            // 兼容旧版字符串数组 → 升级为 { name, subjectId: null }
            q.teachers = q.teachers.map(t => {
                if (typeof t === 'string') return { name: t, subjectId: null, subjectName: null };
                if (!t || typeof t !== 'object') return null;
                if (typeof t.name !== 'string') return null;
                return { name: t.name, subjectId: t.subjectId || null, subjectName: t.subjectName || null };
            }).filter(Boolean);
            // 去重（按 name）
            const seen = new Set();
            q.teachers = q.teachers.filter(t => {
                if (seen.has(t.name)) return false;
                seen.add(t.name); return true;
            });
            // 清理旧字段
            if ('knownSenders' in q) delete q.knownSenders;
            if (q.scanIntervalSeconds === undefined) q.scanIntervalSeconds = 0.5;
            if (q.cooldownSeconds === undefined) q.cooldownSeconds = 3;
            if (!Array.isArray(q.pendingCandidates)) q.pendingCandidates = [];
            // 关键词兜底：旧 settings 无此字段时填充默认词表
            if (!q.keywords || typeof q.keywords !== 'object') q.keywords = {};
            const DEFAULT_STRONG = ['作业', '完成', '上交', '提交', '订正', '背诵', '默写'];
            const DEFAULT_WEAK = ['做', '写', '复习', '预习', '练习', '答案'];
            if (!Array.isArray(q.keywords.strong)) q.keywords.strong = DEFAULT_STRONG;
            if (!Array.isArray(q.keywords.weak)) q.keywords.weak = DEFAULT_WEAK;
            // ---- Schema 版本管理 ----
            if (!state.settings.schemaVersion) state.settings.schemaVersion = 1;
            // ---- 首次使用向导兜底 ----
            if (state.settings.wizardCompleted === undefined) state.settings.wizardCompleted = false;
            if (state.settings.acceptedAgreementVersion === undefined) state.settings.acceptedAgreementVersion = '';
            // 未来版本迁移在此添加，例如：
            // if (state.settings.schemaVersion === 1) { ... migrate to 2 ...; state.settings.schemaVersion = 2; }
        } catch (e) {
            console.error('加载数据失败:', e);
            toast('数据加载失败');
            state.homeworks = [];
            state.subjectList = [...DEFAULT_SUBJECTS];
            isFreshInstall = true;  // 加载失败按首次使用处理（后续保存会重建数据）
        }
    }

    let _persistChain = Promise.resolve(true);

    /** 执行一次完整快照保存。每次运行时读取最新 state，避免旧快照覆盖新改动。 */
    function runSave() {
        return (async () => {
            try {
                const result = await api.saveData({
                    homeworks: state.homeworks,
                    subjects: state.subjectList,
                    settings: state.settings
                });
                if (result && result.success === false) {
                    toast('保存失败');
                    return false;
                }
                return true;
            } catch (e) {
                console.error('持久化失败:', e);
                toast('保存失败');
                return false;
            }
        })();
    }

    /** 所有持久化入口都走同一个串行队列，防止并发保存互相覆盖。 */
    function _persist() {
        const next = _persistChain.then(runSave, runSave);
        _persistChain = next.then(() => true, () => true);
        return next;
    }

    /** 先更新内存并排队写盘；写盘失败时回滚内存，保持 UI 与磁盘一致。 */
    async function persistHomeworks(newHomeworks) {
        const previousHomeworks = state.homeworks;
        state.homeworks = newHomeworks;
        const ok = await _persist();
        if (!ok) state.homeworks = previousHomeworks;
        return ok;
    }

    async function saveHomeworks() {
        return await _persist();
    }

    async function saveSettings() {
        return await _persist();
    }

    async function saveSubjects() {
        return await _persist();
    }

    // 是否首次安装（loadAll 后有效）：磁盘上无 settings 记录
    window.AppStorage = { loadAll, saveHomeworks, saveSettings, saveSubjects, persistHomeworks, get isFreshInstall() { return isFreshInstall; } };
})();
