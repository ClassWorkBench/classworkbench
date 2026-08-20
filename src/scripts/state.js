// ============================================
// state.js
// 全局状态与 DOM 引用集中管理
// ============================================

let homeworks = [];
let subjectList = [];
function localTodayStr() {
    const d = new Date();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${month}-${day}`;
}
let currentViewDate = localTodayStr();
let settings = {
    eveningSections: [
        { start: '19:00', end: '19:50' },
        { start: '20:00', end: '20:50' },
        { start: '21:00', end: '21:50' }
    ],
    contentFontSize: 26,
    openmeteoCities: [],           // Open-Meteo 城市列表 [{ id, name, lat, lon, country, admin1, timezone }]
    qweatherCities: [],            // 和风天气城市列表 [{ id, name, locationId, country, admin1, timezone }]
    weatherProvider: 'openmeteo',    // 'openmeteo' | 'qweather'
    weatherRefreshInterval: 30,      // 天气刷新间隔（分钟），0 = 不刷新
    weatherRefreshMode: 'foreground',    // 'always' | 'foreground' 始终刷新 / 仅前台刷新（默认前台更省资源，可在设置面板改）
    qweatherApiHost: '',             // 和风天气专属 API Host
    qweatherApiKey: '',              // 和风天气 API Key（旧认证，JWT 迁移后保留兼容）
    qweatherKid: '',                 // 和风 JWT 凭据 ID（控制台-项目管理查看）
    qweatherSub: '',                 // 和风 JWT 项目 ID（sub 签发主体）
    qweatherPrivateKey: '',          // 和风 Ed25519 私钥（PEM，仅主进程用于签名，不落渲染层）
    alertEnabledLevels: ['blue', 'yellow', 'orange', 'red'],  // 预警级别筛选，默认全选
    bgRefreshInterval: 30,
    bgSource: 'upx8',
    bgRefreshMode: 'foreground',       // 'always' | 'foreground' 始终刷新 / 仅前台刷新（默认前台更省资源，可在设置面板改）
    cardColumns: 3,
    autoNumber: true,                // 弹窗中回车自动编号，首次预置 "1. "
    beautifyNumber: true,            // 卡片中把 "1. " 格式化为圆圈编号显示
    blurBars: true,                  // 顶/底栏/Toast 高斯模糊
    blurCard: true,                  // 作业卡片高斯模糊
    blurModal: true,                 // 模态弹窗高斯模糊
    reduceAnimation: false,          // 减弱动画效果（压缩过渡/动画时长）
    // 首次使用向导
    wizardCompleted: false,          // 是否已完成首次设置向导
    acceptedAgreementVersion: '',    // 已同意的用户协议/隐私声明版本（AGREEMENT_VERSION）
    // QQ sidecar 配置
    qq: {
        enabled: false,                // 是否启用监听
        // 老师列表：每项 { name: QQ昵称, subjectId: 学科id, subjectName: 学科名（冗余便于显示） }
        teachers: [],
        scanIntervalSeconds: 0.5,      // sidecar 轮询间隔
        cooldownSeconds: 3,            // 同条消息冷却
        // 作业关键词（用户可自定义，分值固定：强 +40 / 弱 +30）
        keywords: {
            strong: ['作业', '完成', '上交', '提交', '订正', '背诵', '默写'],
            weak: ['做', '写', '复习', '预习', '练习', '答案']
        },
        // 待确认作业候选队列
        pendingCandidates: []
    }
};

const $ = (id) => document.getElementById(id);

const dom = {
    clockDisplay: () => $('clockDisplay'),
    eveningLabel: () => $('eveningLabel'),
    eveningTime: () => $('eveningTime'),
    progressFill: () => $('progressFill'),
    progressBar: () => document.querySelector('#progressBar'),
    cardsGrid: () => $('cardsGrid'),
    subjectPills: () => $('subjectPills'),
    dateText: () => $('dateText'),
    toastContainer: () => $('toastContainer'),
    weatherAreaName: () => $('weatherAreaName'),
    weatherEmoji: () => $('weatherEmoji'),
    weatherTemp: () => $('weatherTemp'),
    weatherDesc: () => $('weatherDesc'),
    weatherDisplay: () => $('weatherDisplay'),
    alertCapsule: () => $('alertCapsule'),
    alertDot: () => $('alertDot'),
    alertText: () => $('alertText'),
    alertCount: () => $('alertCount'),
    bgLayer: () => $('bgLayer'),
    topCapsule: () => $('topCapsule'),
    modalRoot: () => $('modalRoot'),
    moreToggle: () => $('moreToggle'),
    dateBtn: () => $('dateBtn'),
    bottomCapsule: () => $('bottomCapsule'),
    dpPrev: () => $('dpPrev'),
    dpNext: () => $('dpNext'),
};

window.AppState = {
    get homeworks() { return homeworks; },
    set homeworks(v) { homeworks = v; },
    get subjectList() { return subjectList; },
    set subjectList(v) { subjectList = v; },
    get currentViewDate() { return currentViewDate; },
    set currentViewDate(v) { currentViewDate = v; },
    get settings() { return settings; },
    set settings(v) { settings = v; },
    dom,
};
