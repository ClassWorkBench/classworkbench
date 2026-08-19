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

    // 读取随应用分发的协议/文档源文件（agreement / privacy / security）
    readDoc: (name) => ipcRenderer.invoke('docs:read', name),

    // 应用版本号（来自 package.json）
    getVersion: () => ipcRenderer.invoke('app:getVersion'),

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
