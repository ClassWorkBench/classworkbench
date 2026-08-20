// ============================================
// config.js
// 存储键、默认学科、地区坐标、天气码字典
// ============================================

const STORAGE = {
    HOMEWORKS: 'hw_v2',
    SETTINGS: 'settings_v2',
    SUBJECTS: 'subjects_v2',
};

// 协议版本兜底常量（与 AGREEMENT.md 头部 "**版本：vX.Y.Z**" 保持同一数值）。
// 运行期协议版本以实际文档内容（在线同步优先）解析为准，此常量仅在文档无法解析时兜底显示。
const AGREEMENT_VERSION = '1.0.0';

// 应用版本号（与 package.json version 保持一致；仅当主进程版本获取失败时兜底显示）
const APP_VERSION = '1.0.0';

const DEFAULT_SUBJECTS = [
    { id: 'chinese', name: '语文', color: '#d97a6a' },
    { id: 'math', name: '数学', color: '#6a7ad9' },
    { id: 'english', name: '英语', color: '#4ab8b8' },
    { id: 'physics', name: '物理', color: '#4a8ad9' },
    { id: 'chemistry', name: '化学', color: '#d97aaa' },
    { id: 'biology', name: '生物', color: '#4ab87a' },
    { id: 'history', name: '历史', color: '#d9a84a' },
    { id: 'politics', name: '政治', color: '#8a7ad9' },
];

// Open-Meteo 城市搜索 API
const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';

const weatherCodeDict = {
    0: { emoji: '☀️', text: '晴朗' },
    1: { emoji: '🌤️', text: '大部晴朗' },
    2: { emoji: '⛅', text: '多云' },
    3: { emoji: '☁️', text: '阴天' },
    45: { emoji: '🌫️', text: '雾天' },
    48: { emoji: '🌫️', text: '霜雾' },
    51: { emoji: '🌧️', text: '小雨' },
    53: { emoji: '🌧️', text: '中雨' },
    55: { emoji: '🌧️', text: '大雨' },
    56: { emoji: '🌧️', text: '冻小雨' },
    57: { emoji: '🌧️', text: '冻大雨' },
    61: { emoji: '🌦️', text: '阵雨小雨' },
    63: { emoji: '🌦️', text: '阵雨中雨' },
    65: { emoji: '🌦️', text: '阵雨大雨' },
    66: { emoji: '🌨️', text: '冻阵雨小雨' },
    67: { emoji: '🌨️', text: '冻阵雨大雨' },
    71: { emoji: '❄️', text: '小雪' },
    73: { emoji: '❄️', text: '中雪' },
    75: { emoji: '❄️', text: '大雪' },
    77: { emoji: '🌨️', text: '雪粒' },
    80: { emoji: '🌦️', text: '零星阵雨' },
    81: { emoji: '🌦️', text: '中度阵雨' },
    82: { emoji: '⛈️', text: '强阵雨' },
    85: { emoji: '🌨️', text: '小雪阵雪' },
    86: { emoji: '🌨️', text: '大雪阵雪' },
    95: { emoji: '⛈️', text: '雷暴' },
    96: { emoji: '⛈️', text: '雷暴伴小冰雹' },
    99: { emoji: '⛈️', text: '雷暴伴大冰雹' }
};

// 和风天气图标码 → emoji 映射
const qweatherIconMap = {
    100: { emoji: '☀️', text: '晴' },
    101: { emoji: '⛅', text: '多云' },
    102: { emoji: '🌤️', text: '少云' },
    103: { emoji: '⛅', text: '晴间多云' },
    104: { emoji: '☁️', text: '阴' },
    150: { emoji: '🌙', text: '晴（夜）' },
    151: { emoji: '🌙', text: '多云（夜）' },
    152: { emoji: '🌙', text: '少云（夜）' },
    153: { emoji: '🌙', text: '晴间多云（夜）' },
    154: { emoji: '☁️', text: '阴（夜）' },
    300: { emoji: '🌦️', text: '阵雨' },
    301: { emoji: '🌧️', text: '强阵雨' },
    302: { emoji: '⛈️', text: '雷阵雨' },
    303: { emoji: '⛈️', text: '强雷阵雨' },
    304: { emoji: '🌨️', text: '雷阵雨伴冰雹' },
    305: { emoji: '🌧️', text: '小雨' },
    306: { emoji: '🌧️', text: '中雨' },
    307: { emoji: '🌧️', text: '大雨' },
    308: { emoji: '🌧️', text: '极端降雨' },
    309: { emoji: '🌧️', text: '毛毛雨' },
    310: { emoji: '🌧️', text: '暴雨' },
    311: { emoji: '🌧️', text: '大暴雨' },
    312: { emoji: '🌧️', text: '特大暴雨' },
    313: { emoji: '🧊', text: '冻雨' },
    314: { emoji: '🌧️', text: '小雨（夜）' },
    315: { emoji: '🌧️', text: '中雨（夜）' },
    316: { emoji: '🌧️', text: '大雨（夜）' },
    317: { emoji: '🌧️', text: '极端降雨（夜）' },
    318: { emoji: '🌧️', text: '暴雨（夜）' },
    400: { emoji: '🌨️', text: '小雪' },
    401: { emoji: '❄️', text: '中雪' },
    402: { emoji: '❄️', text: '大雪' },
    403: { emoji: '❄️', text: '暴雪' },
    404: { emoji: '🌨️', text: '雨夹雪' },
    405: { emoji: '🌨️', text: '雨雪天气' },
    406: { emoji: '🌨️', text: '阵雨夹雪' },
    407: { emoji: '🌨️', text: '阵雪' },
    500: { emoji: '🌫️', text: '薄雾' },
    501: { emoji: '🌫️', text: '雾' },
    502: { emoji: '🌫️', text: '霾' },
    503: { emoji: '🌫️', text: '扬沙' },
    504: { emoji: '🌫️', text: '浮尘' },
    508: { emoji: '🌫️', text: '沙尘暴' },
    509: { emoji: '🌫️', text: '强沙尘暴' },
    510: { emoji: '🌫️', text: '浓雾' },
    511: { emoji: '🌫️', text: '强浓雾' },
    512: { emoji: '🌫️', text: '中度霾' },
    513: { emoji: '🌫️', text: '重度霾' },
    514: { emoji: '🌫️', text: '严重霾' },
    515: { emoji: '🌫️', text: '大雾' },
};

// 暴露到 window（因为没有用模块系统）
window.AppConfig = {
    STORAGE,
    AGREEMENT_VERSION,
    APP_VERSION,
    DEFAULT_SUBJECTS,
    GEOCODING_URL,
    weatherCodeDict,
    qweatherIconMap,
};
