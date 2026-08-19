// ============================================
// floating-preload.js — 浮窗窗口安全桥接
// 只暴露浮窗所需的最小 IPC 面，无 Node 能力
// ============================================

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('floatingAPI', {
    // 获取本窗口对应的卡片数据
    init: () => ipcRenderer.invoke('float:init'),
    // 内容渲染完成，报告自然高度（主进程据此布局）
    ready: (height) => ipcRenderer.invoke('float:ready', height),
    // 退出整个浮窗模式（恢复主窗口）
    exitAll: () => ipcRenderer.invoke('float:exitAll'),
    // 贴边隐藏：已贴边则滑出
    dock: () => ipcRenderer.invoke('float:dock'),
    // 取消淡化：恢复不透明状态
    unfade: () => ipcRenderer.invoke('float:unfade'),
    // 重新计时淡化：鼠标离开探头后，3 秒后再次淡化
    refade: () => ipcRenderer.invoke('float:refade'),
    // 完全滑出：回到贴边前的位置
    undock: () => ipcRenderer.invoke('float:undock'),
    // 订阅贴边指令：进入探头模式（带贴边方向/学科色）
    onProbe: (cb) => {
        const h = (_e, data) => cb(data);
        ipcRenderer.on('float:probe', h);
        return () => ipcRenderer.removeListener('float:probe', h);
    },
    // 订阅滑出指令：退出探头模式
    onProbeOff: (cb) => {
        const h = () => cb();
        ipcRenderer.on('float:probe-off', h);
        return () => ipcRenderer.removeListener('float:probe-off', h);
    },
    // 订阅探头淡化指令：变成小探头后 3 秒，探头半透明
    onProbeFade: (cb) => {
        const h = () => cb();
        ipcRenderer.on('float:probe-fade', h);
        return () => ipcRenderer.removeListener('float:probe-fade', h);
    },
    // 订阅取消探头淡化指令：恢复不透明
    onProbeUnfade: (cb) => {
        const h = () => cb();
        ipcRenderer.on('float:probe-unfade', h);
        return () => ipcRenderer.removeListener('float:probe-unfade', h);
    },
    // 订阅退出渐出指令：播放动画后调用 closeAfterFade
    onFadeOut: (cb) => {
        const h = () => cb();
        ipcRenderer.on('float:fade-out', h);
        return () => ipcRenderer.removeListener('float:fade-out', h);
    },
    // 渐出动画播完，通知主进程销毁窗口
    closeAfterFade: () => ipcRenderer.invoke('float:closeAfterFade')
});
