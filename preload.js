// ============================================
// preload.js
// 安全桥接：渲染进程 ↔ 主进程（IPC）
// ============================================

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // 加载所有活跃数据（settings + subjects + homeworks，homeworks 已自动归档筛选）
    loadData: () => ipcRenderer.invoke('data:load'),

    // 保存所有活跃数据（保存前主进程自动归档超期作业）
    saveData: (data) => ipcRenderer.invoke('data:save', data),

    // 备份与恢复（导出 JSON 自选路径 / 导入 JSON / 恢复前自动快照 / 归档收集与写回）
    exportBackup: (suggestedName, payload) => ipcRenderer.invoke('data:exportBackup', { suggestedName, payload }),
    importBackup: () => ipcRenderer.invoke('data:importBackup'),
    createRestoreSnapshot: (data) => ipcRenderer.invoke('data:createSnapshot', data),
    getArchives: () => ipcRenderer.invoke('data:getArchives'),
    restoreArchives: (archives) => ipcRenderer.invoke('data:restoreArchives', archives),

    // 浮窗模式（画中画）：进入/退出 + 主进程事件订阅
    floatEnter: (cards) => ipcRenderer.invoke('float:enter', cards),
    floatExit: () => ipcRenderer.invoke('float:exit'),
    onFloatCardBack: (cb) => {
        const h = (_e, data) => cb(data);
        ipcRenderer.on('float:card-back', h);
        return () => ipcRenderer.removeListener('float:card-back', h);
    },
    onFloatExited: (cb) => {
        const h = (_e, data) => cb(data);
        ipcRenderer.on('float:exited', h);
        return () => ipcRenderer.removeListener('float:exited', h);
    },

    // 归档相关（只读，供内嵌归档视图使用）
    archiveGetMonths: () => ipcRenderer.invoke('archive:getMonths'),
    archiveLoadMonth: (monthKey) => ipcRenderer.invoke('archive:loadMonth', monthKey),

    // 开机自启
    getAutoLaunch: () => ipcRenderer.invoke('app:getAutoLaunch'),
    setAutoLaunch: (enabled) => ipcRenderer.invoke('app:setAutoLaunch', enabled),

    // 背景图本地缓存
    getBackground: () => ipcRenderer.invoke('bg:get'),
    refreshBackground: () => ipcRenderer.invoke('bg:fetch'),

    // 自定义窗口控制
    windowControls: {
        close: () => ipcRenderer.invoke('window:close')
    },

    // 排版成图：截取当前页面并写入剪贴板位图
    copyLayoutImage: () => ipcRenderer.invoke('page:copy'),

    // 打开外部链接
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

    // 和风天气（JWT 认证）：主进程签名并请求，渲染层不接触私钥
    qweather: {
        // 发起一条和风 API 请求。endpoint 可为 ''（空）或含 {lat}/{lon} 占位的路径。
        // args: { endpoint, query?, lat?, lon? }；返回 { ok, data } 或 { ok:false, error }
        get: (args) => ipcRenderer.invoke('qweather:get', args),
        // 仅生成一次 JWT 令牌（用于设置面板校验/预览）
        getToken: () => ipcRenderer.invoke('qweather:getToken'),
        // 本机生成一对 Ed25519 密钥（私钥填软件、公钥传和风登记）。返回 { ok, privateKey, publicKey }
        genKeyPair: () => ipcRenderer.invoke('qweather:genKeyPair'),
    },

    // 读取随应用分发的协议/文档源文件（在线缓存优先，后台已同步最新；agreement / privacy / security / opensource / contact）
    readDoc: (name) => ipcRenderer.invoke('docs:read', name),

    // 在线/内置文档版本号（用于判断协议是否已更新）
    getDocVersions: () => ipcRenderer.invoke('docs:getVersions'),

    // 事件订阅：后台同步完成且有文档变化（含 changed 清单）
    onDocsUpdated: (cb) => {
        const h = (_e, data) => cb(data);
        ipcRenderer.on('docs:updated', h);
        return () => ipcRenderer.removeListener('docs:updated', h);
    },

    // 应用版本号（来自 package.json）
    getVersion: () => ipcRenderer.invoke('app:getVersion'),

    // 自动更新（electron-updater + GitHub Releases）：检查/下载/安装均需用户确认
    update: {
        // 检查更新（返回立即结果；后续状态靠 onEvent 推送）
        check: () => ipcRenderer.invoke('updater:check'),
        // 确认后开始下载
        download: () => ipcRenderer.invoke('updater:download'),
        // 确认后退出应用并安装
        install: () => ipcRenderer.invoke('updater:install'),
        // 拉取当前更新状态快照（status/version/percent/error）
        getState: () => ipcRenderer.invoke('updater:state'),
        // 订阅更新事件：{ type: checking|available|progress|downloaded|not-available|error, ... }
        onEvent: (cb) => {
            const h = (_e, data) => cb(data);
            ipcRenderer.on('updater:event', h);
            return () => ipcRenderer.removeListener('updater:event', h);
        },
    },

    // 数据加密状态（算法 / 密钥保护方式，供设置面板展示）
    getCipherStatus: () => ipcRenderer.invoke('app:cipherStatus'),

    // ---- QQ sidecar ----
    qq: {
        // 开关 sidecar；配置由主进程从 store 自取，渲染层只需传 enabled
        toggle: (enabled) => ipcRenderer.invoke('qq:toggle', enabled),
        // 查询运行状态
        getStatus: () => ipcRenderer.invoke('qq:getStatus'),
        // 更新配置（重启 sidecar 生效，配置由主进程从 store 自取）
        updateConfig: () => ipcRenderer.invoke('qq:updateConfig'),
        // 事件订阅：收到一条 QQ 通知
        onNotification: (cb) => {
            const h = (_e, data) => cb(data);
            ipcRenderer.on('qq:notification', h);
            return () => ipcRenderer.removeListener('qq:notification', h);
        },
        // 事件订阅：sidecar 状态变化
        onStatus: (cb) => {
            const h = (_e, data) => cb(data);
            ipcRenderer.on('qq:status', h);
            return () => ipcRenderer.removeListener('qq:status', h);
        },
        // 事件订阅：错误
        onError: (cb) => {
            const h = (_e, data) => cb(data);
            ipcRenderer.on('qq:error', h);
            return () => ipcRenderer.removeListener('qq:error', h);
        },
    },
});
