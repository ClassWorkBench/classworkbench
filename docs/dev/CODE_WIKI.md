# 班级工作台 (ClassWorkBench) · Code Wiki

> 版本：1.0.0　|　应用 ID：`com.classworkbench.app`　|　技术栈：Electron 33 + 原生 JS/CSS + C# Sidecar
>
> 本文档基于源码静态分析生成，覆盖项目整体架构、模块职责、关键类与函数、依赖关系及运行方式。
>
> **版本演进**：v1.0.0 起已完成主进程模块化（`main/` 目录）、浮窗模式（画中画）、多城市天气搜索、备份恢复、自定义颜色选择器、辅助功能设置、设置面板拆分（`settings/` 目录）、**作业搜索**、**自动更新**（electron-updater + GitHub Releases）、**协议文档在线同步**（三源兜底 + SHA-256）、**和风天气 JWT 认证**、**首启向导**、**Fluent UI Emoji 图标系统**等全部能力。

---

## 目录

1. [项目概览](#1-项目概览)
2. [整体架构](#2-整体架构)
3. [目录结构](#3-目录结构)
4. [主进程（main.js + main/ 模块）](#4-主进程mainjs--main-模块)
5. [预加载脚本（preload.js / floating-preload.js）](#5-预加载脚本preloadjs--floating-preloadjs)
6. [渲染进程模块详解](#6-渲染进程模块详解)
7. [QQ Sidecar 子进程](#7-qq-sidecar-子进程)
8. [数据模型与存储设计](#8-数据模型与存储设计)
9. [IPC 通信协议](#9-ipc-通信协议)
10. [关键业务流程](#10-关键业务流程)
11. [样式架构](#11-样式架构)
12. [依赖关系](#12-依赖关系)
13. [构建与运行](#13-构建与运行)

---

## 1. 项目概览

**班级工作台** 是一款面向中学班级场景的 Electron 桌面应用，核心用途是**在班级大屏上展示当日各学科作业**，并配套晚修进度、天气与预警、云端背景图、QQ 作业自动捕获、浮窗画中画等实用功能。默认场景定位为中学班级教学。

### 核心功能

| 功能模块       | 说明                                                                                  |
| ---------- | ----------------------------------------------------------------------------------- |
| 作业卡片展示     | 按日期展示各学科作业，卡片采用学科色整体追色 + 瀑布流双栏布局（支持 3 列），编号可美化为圆圈徽章                                |
| 作业增删改      | 底栏学科按钮快速添加（回车自动编号）；卡片点击展开编辑/删除（二次确认）                                                |
| 晚修进度       | 顶栏实时显示当前处于第几节晚修、已过时长与进度条                                                           |
| 天气显示       | 双 API 支持：Open-Meteo（免费）与和风天气（精准，需 JWT 认证）；含离线缓存；**多城市搜索管理**（可搜索全球/全国城市，拖拽排序）          |
| 天气预警       | 和风天气专属：蓝/黄/橙/红四级预警，顶栏胶囊展示，点击查看详情，可按级别筛选                                            |
| **浮窗模式（画中画）** | 每个作业卡片变成独立无边框置顶小窗，贴屏幕右侧竖排；支持系统级拖动、贴边隐藏（探头预展）、放大回主窗口、单卡关闭                    |
| **备份与恢复**   | 设置按面板分组勾选导出、作业按日期范围/全部导出（可含归档）；恢复默认"覆盖 + 恢复前自动快照"，支持手动合并                    |
| 云端背景图      | 主进程下载并本地缓存（带完整性校验），支持双图源切换；渲染层只负责解码显示                                              |
| QQ 作业自动捕获  | C# Sidecar 监听 QQ 通知 → 渲染层引擎评分抽取作业候选 → 学科胶囊红点提示 → 采纳面板批量保存/合并/忽略                     |
| 自动按月归档     | 超过 3 个月的作业自动从主数据迁移到 `archives/YYYY-MM.json`                                        |
| 归档查看       | 设置内嵌的只读归档视图，可按月份翻阅历史作业                                                             |
| 学科管理       | 自定义学科名称与颜色（**5 套色系取色器**：经典/莫兰迪/马卡龙/国风/自然）                                           |
| 辅助功能       | 作业字号三档（20/26/32px）、减弱动画、三路模糊开关（顶底栏/卡片/弹窗）——面向教室投屏的可视性优化                          |
| 日期导航       | 前后翻阅日期，最早不超过 3 个月前（更早需进归档查看）                                                        |
| 系统托盘       | 关闭窗口隐藏到托盘，托盘菜单可显示主界面或退出                                                            |
| 开机自启       | Windows 登录项，开机后以后台模式启动并最小化到托盘                                                      |
| 复制排版图      | 截取当前页面写入剪贴板，可直接粘贴到 QQ/微信                                                            |
| **作业搜索**     | 更多菜单 → 作业搜索：按关键词/学科/日期范围，支持标题+内容+学科名匹配，可选包含归档，命中高亮 + 跳转到日期                       |
| **自动更新**     | electron-updater + GitHub Releases：启动静默检查一次，检查/下载/安装全由用户在"关于"面板确认，状态机实时推送             |
| **协议文档同步**   | 启动后台异步三源兜底拉取线上协议/文档（GitHub Pages → jsDelivr → raw），SHA-256 比对落盘缓存，变更即通知重新确认           |
| **首启向导**     | 首次启动向导：设置加密开关 / 默认学科配色，随后进入主界面                                              |
| 自定义窗口      | 无边框窗口 + 自定义关闭按钮                                                                     |

### 设计特点

- **无打包器/无框架**：渲染层全部使用原生 JS，通过 `window.*` 全局对象暴露模块，按依赖顺序在 `index.html` 中以 `<script>` 标签加载。
- **主进程模块化 + 工厂依赖注入**：`main.js` 仅 ~180 行启动编排；业务逻辑下沉到 `main/` 下 14 个领域模块，每个模块导出 `createXxxModule(deps)` 工厂函数，由 `main.js` 显式注入依赖（store / fs / log / 回调等），无全局单例，便于测试。
- **安全 IPC**：主进程关闭 `nodeIntegration`、开启 `contextIsolation` + `sandbox`，仅通过 `preload.js` / `floating-preload.js` 的 `contextBridge` 暴露最小 API。CSP 策略限制资源加载范围。
- **数据加密**：自实现加密存储替代 electron-store —— AES-256-GCM 加密主数据文件，密钥经 Windows DPAPI 加密落盘，仅当前用户可解；GCM AuthTag 提供完整性校验，密文被改一个字节解密必失败；safeStorage 不可用时降级明文并如实暴露状态。
- **玻璃拟态 UI**：顶栏/底栏/弹窗/卡片统一使用 `backdrop-filter` 毛玻璃 + 半透明底风格，三路均可单独关闭（辅助功能）。
- **浮窗复用主窗口样式**：浮窗卡片直接加载 `base.css + components.css`，使用主窗口 `.homework-card` 类与 `blur-card-off` 实色追色效果，与主窗口"关闭卡片模糊"100% 一致，无样式分叉。
- **主进程背图缓存**：背景图由主进程下载、校验（JPEG/PNG/WebP/GIF 魔数检测）、本地缓存（上限 6 张），渲染层零网络请求，断网也能显示缓存图。
- **串行持久化**：所有保存操作走同一串行队列，防止并发写入互相覆盖；写盘失败回滚内存状态。
- **Sidecar 健壮性**：QQ 监听子进程崩溃后指数退避自动重启（3s→6s→…→384s），连续崩溃 8 次停止并报错。
- **恢复前自动快照**：任何恢复操作前先把当前数据快照到 `userData/restore-snapshots/`，误恢复可回退。

---

## 2. 整体架构

应用采用 Electron 三进程结构 + 浮窗子窗口 + C# Sidecar 子进程：

```
┌────────────────────────────────────────────────────────────────────┐
│                主进程 main.js（启动编排层，~180 行）                    │
│   工厂实例化 + 显式依赖注入，模块间通过回调/引用对象通信                     │
│  ┌──────────────────────── main/ 领域模块（14 个）──────────────────┐ │
│  │ constants.js  共享常量（图源/自启注册表/Sidecar阈值/窗口尺寸）       │ │
│  │ data-cipher.js 数据加密原语（AES-256-GCM + DPAPI）  ★              │ │
│  │ data-store.js  加密存储（兼容 electron-store 接口）              │ │
│  │ window.js     主窗口 BrowserWindow + Tray + 生命周期钩子          │ │
│  │ archive.js    按月归档（原子写入/损坏备份/幂等去重）                 │ │
│  │ background-cache.js  背景图缓存（魔数校验/索引/下载驱逐）           │ │
│  │ auto-launch.js  开机自启 + 开发版自启清理                          │ │
│  │ sidecar.js    QQ Sidecar 进程管理（崩溃退避/竞态修复）             │ │
│  │ backup.js     备份导出导入/恢复前快照/归档收集写回                   │ │
│  │ floating.js   浮窗模式（画中画：每卡一窗，置顶/拖动/贴边/预展）        │ │
│  │ docs-sync.js  协议/文档三源同步（Pages/jsDelivr/raw + SHA-256）   │ │
│  │ qweather-auth.js 和风天气 JWT 认证客户端（主进程签名）             │ │
│  │ updater.js    自动更新（electron-updater + GitHub Releases）    │ │
│  │ ipc.js        IPC 胶水层（41 个 handler，无业务逻辑）              │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                              │                                      │
│                      IPC Handlers（41 个）                           │
└──────────────┬─────────────────────────┬───────────────────────────┘
               │ preload.js              │ floating-preload.js
      ┌────────┴─────────┐    ┌──────────┴──────────┐
      │  主窗口渲染进程     │    │  浮窗渲染进程（N 个）   │
      │ src/scripts/*.js │    │ floating.html        │
      │ + settings/ 9 个  │    │ floating-window.js   │
      │ （34 个脚本）      │    │ 复用主窗口卡片样式       │
      └────────┬─────────┘    └─────────────────────┘
               │ spawn
┌──────────────┴─────────────────────────────────────────────────────┐
│              QQ Sidecar (qq-listener.exe · C# .NET 8)              │
│  监听 Windows 通知中心 → 过滤 QQ → NDJSON stdout 输出                │
│  事件: Ready / Notification / Homework / Log / Error / Stop        │
└────────────────────────────────────────────────────────────────────┘
```

### 进程职责划分

| 进程       | 文件                                       | 职责                                                       |
| -------- | ---------------------------------------- | -------------------------------------------------------- |
| 主进程     | `main.js` + `main/*.js` (14 个)           | 启动编排、依赖注入；窗口/托盘生命周期、加密存储读写、按月归档、背图下载缓存、QQ sidecar 管理、开机自启、备份恢复文件操作、浮窗窗口管理、协议文档同步、和风 JWT 认证、自动更新、IPC 注册、截图剪贴板 |
| 预加载     | `preload.js` / `floating-preload.js`     | 通过 `contextBridge.exposeInMainWorld` 暴露安全的 `electronAPI` / `floatingAPI` |
| 主窗口渲染  | `src/scripts/*.js` + `src/scripts/settings/*.js` | 全部 UI 逻辑，以 `window.App*` 命名空间组织                      |
| 浮窗渲染   | `floating.html` + `src/scripts/floating-window.js` | 单卡片展示 + 高度测量上报 + 贴边探头交互（复用主窗口卡片样式）          |
| Sidecar  | `sidecar/qq-listener.exe`                | C# .NET 8 编译，监听 Windows 通知中心的 QQ 消息，通过 stdout NDJSON 输出 |

---

## 3. 目录结构

```
ClassWorkBench/
├── main.js                 # 主进程入口（启动编排层，~180 行）
├── main/                   # ★ 主进程领域模块（14 个，拆分自 main.js）
│   ├── constants.js        #   共享常量：图源/缓存上限/自启注册表/Sidecar 阈值/窗口尺寸/存储默认值
│   ├── data-cipher.js      #   ★ 数据加密原语（AES-256-GCM + DPAPI 密钥保护）
│   ├── data-store.js       #   ★ 加密数据存储（内存读写 + 加密落盘 + 旧明文迁移 + 损坏自愈）
│   ├── window.js           #   主窗口 BrowserWindow + 系统托盘 + 关闭隐藏钩子
│   ├── archive.js          #   按月归档引擎（cutoff 计算/原子写入/损坏备份/幂等去重）
│   ├── background-cache.js #   背景图缓存（下载/魔数校验/索引/清理）
│   ├── auto-launch.js      #   开机自启（LoginItem + 开发版自启清理）
│   ├── sidecar.js          #   QQ Sidecar 进程管理（spawn/taskkill/退避重启/竞态修复）
│   ├── backup.js           #   备份与恢复（导出导入对话框/恢复前快照/归档收集写回）
│   ├── floating.js         #   浮窗模式（每卡一窗/布局/贴边 dock/预展/动画）
│   ├── docs-sync.js        #   ★ 协议/文档在线同步（三源兜底 + SHA-256 比对 + TTL 缓存）
│   ├── qweather-auth.js    #   ★ 和风天气 JWT 认证客户端（主进程签名，私钥不入渲染层）
│   ├── updater.js          #   ★ 自动更新（electron-updater + GitHub Releases 状态机）
│   └── ipc.js              #   IPC 胶水层（41 个 handler：参数校验→调模块→返回）
├── preload.js              # 主窗口预加载脚本（IPC 桥接）
├── floating.html           # ★ 浮窗窗口 HTML（复用主窗口卡片样式）
├── floating-preload.js     # ★ 浮窗预加载脚本（最小 IPC 面）
├── index.html              # 主窗口 HTML（加载所有 CSS/JS，含 CSP）
├── package.json            # 项目配置 + electron-builder 构建配置
├── 图标.ico                # 应用图标
├── emoji/                  # ★ Fluent UI Emoji 彩色 SVG 图标（38 个）
│   ├── emoji-map.js        #   字符→SVG 映射表（页面加载时替换 <img class=emoji> 的 src）
│   ├── sun_color.svg       #   例：天气/时间相关的彩色花式子图标
│   └── ...                 #   alarm/car/cloud/memo/pencil 等 38 个 SVG
├── icons/                  # 扁平面板图标（4 个：绿/白圆、锁、信息）
├── src/
│   ├── scripts/            # 渲染进程 JS 模块（24 个 + settings/ 9 个）
│   │   ├── config.js           # 常量：存储键、默认学科、地区坐标、天气码字典、和风图标映射、Geocoding URL
│   │   ├── state.js            # 全局状态 + DOM 引用（含多城市/模糊/动画设置）
│   │   ├── utils.js            # 工具函数（日期/JSON/HTML转义/编号/Toast/Markdown）
│   │   ├── storage.js          # 数据加载/持久化（IPC 封装 + 串行队列 + 回滚）
│   │   ├── styling.js          # 样式应用
│   │   ├── weather.js          # ★ 天气（双 API + 多城市搜索 + 预警 + 离线缓存 + 定时刷新）
│   │   ├── background.js       # 背景图（IPC 调用主进程缓存 + 定时刷新）
│   │   ├── layout.js           # 顶栏高度自适应
│   │   ├── renderer.js         # 渲染引擎（卡片/底栏/时钟/晚修/徽标）
│   │   ├── modal.js            # 通用模态框（支持嵌套/替换）
│   │   ├── search.js           # ★ 作业搜索（关键词/学科/日期范围 + 归档可选 + 高亮跳转）
│   │   ├── dialogs.js          # 业务弹窗（添加/修改作业 + 自动编号）
│   │   ├── color-picker.js     # ★ 自定义颜色选择器（5 套色系，弹出层）
│   │   ├── archive-renderer.js # 归档查看视图（只读）
│   │   ├── homework-engine.js  # ★ 作业识别引擎（QQ 通知→候选评分）
│   │   ├── qq-pending-dialog.js# ★ 待确认作业面板（徽标/采纳/合并/忽略）
│   │   ├── backup.js           # ★ 备份与恢复（渲染层业务：分组勾选/日期范围/快照/合并）
│   │   ├── settings.js         # 设置面板入口（组装 ctx + 左右分栏骨架）
│   │   ├── wizard.js           # ★ 首启向导（加密开关/默认学科配色）
│   │   ├── floating-mode.js    # ★ 主窗口侧浮窗模式控制（进入/退出/卡片过滤）
│   │   ├── floating-window.js  # ★ 浮窗窗口渲染层（内容填充/高度测量/菜单/贴边探头）
│   │   ├── more-menu.js        # ★ 更多菜单（搜索/复制排版图/浮窗/设置）
│   │   ├── window-controls.js  # ★ 自定义窗口关闭按钮
│   │   ├── datepicker.js       # 日期选择器/导航
│   │   ├── main.js             # 渲染进程入口（启动编排）
│   │   └── settings/           # ★ 设置面板子模块（9 个）
│   │       ├── nav.js          #   左侧导航切换
│   │       ├── general.js      #   常规设置（晚修时段/开机自启）
│   │       ├── weather.js      #   天气面板（provider 切换/城市搜索列表/API 配置弹窗/预警筛选/刷新）
│   │       ├── personal.js     #   个性化（背景/列数/编号美化）
│   │       ├── accessibility.js#   辅助功能（字号三档/减弱动画/三路模糊开关）
│   │       ├── subjects.js     #   学科管理（增删 + ColorPicker）
│   │       ├── qq.js           #   QQ 监听（老师绑定/关键词/高级参数/运行状态）
│   │       ├── data.js         #   数据管理（归档入口/备份恢复入口/清空）
│   │       └── about.js        #   ★ 关于（版本号/检查更新/本次更新/协议文档入口）
│   └── styles/             # 样式文件（6 个）
│       ├── base.css            # CSS 变量、全局重置、滚动条
│       ├── layout.css          # 背景层、顶/底栏、卡片网格布局
│       ├── components.css      # 组件样式（卡片/按钮/弹窗/Toast/设置项/取色器/备份弹窗…）
│       ├── animations.css      # 关键帧动画 + 响应式
│       ├── floating.css        # ★ 浮窗专属（窗口定位/拖拽/控件/贴边探头）
│       └── wizard.css          # ★ 首启向导专属样式
├── sidecar/                # QQ 监听 Sidecar（C# .NET 8 源码 + 编译产物）
│   └── qq-listener/        # C# 项目
│       └── bin/Release/.../publish/qq-listener.exe
├── tools/                  # 开发辅助脚本
│   ├── check-emoji.mjs     #   ★ emoji-map.js 与 emoji/ 目录一致性校验（npm run check:emoji）
│   └── publish-helper/     #   ★ 发布助手（WPF/.NET：发新版本 + 同步协议文档）
├── docs/dev/               # 开发者文档
│   ├── CODE_WIKI.md        #   本文档
│   └── UNINSTALL_DATA_CLEANUP.md  # 卸载数据清理说明
├── build/                  # 安装包定制
│   └── cwb-uninstaller.nsh #   卸载时询问是否删除用户数据
├── dist/                  # 构建产物（electron-builder 输出，git 忽略）
├── icons/                 # 应用相关图标
└── node_modules/          # 依赖
```

---

## 4. 主进程（main.js + main/ 模块）

> `main.js` 已从 1134 行精简为 ~180 行**启动编排层**。所有业务逻辑下沉到 `main/` 下 14 个领域模块，每个模块导出 `createXxxModule(deps)` 工厂函数，由 `main.js` 在 `whenReady` 后显式注入依赖。

### 4.1 模块化设计

```
main.js（编排层）
  │  共享引用对象：mainWindowRef / isQuittingRef / trayRef / atomicWriteRef
  │  （用 {value} 对象包装，异步赋值后各模块也能读到最新值）
  │
  ├─ createCipherModule({ app, fs, path, log, safeStorage })          ★ 加密原语（最先初始化）
  ├─ createDataStore({ app, fs, path, log, cipher, defaults, isEncryptionEnabled })  ★ 加密存储
  ├─ createArchiveModule({ archivesDir, store, atomicWriteRef, fs, path, log, cipher, isEncryptionEnabled })
  ├─ createBgCacheModule({ app, fs, path, crypto, net, ..., getSettings })
  ├─ createAutoLaunchModule({ app, fs, path, execFileSync, log })
  ├─ createBackupModule({ app, dialog, fs, path, log, store, archive, cipher, isEncryptionEnabled })
  ├─ createSidecarModule({ app, fs, path, log, spawn, execSync, callbacks:{emit} })
  ├─ createWindowModule({ BrowserWindow, Tray, Menu, ..., onMainWindowChange })
  ├─ createFloatingModule({ BrowserWindow, screen, path, log, getMainWindow, showMainWindow, emit })
  ├─ createDocsSync({ app, fs, path, crypto, net, log })           ★ 协议/文档在线同步
  ├─ createQweatherClient({ net, log })                            ★ 和风天气 JWT 认证
  ├─ createUpdaterModule({ app, log, net, getMainWindow })         ★ 自动更新
  └─ setupIpc({ ipcMain, clipboard, shell, log, store,
                archive, bg, autoLaunch, sidecar, backup, floating, cipher,
                docsSync, qweather, updater,
                getMainWindow, getQqConfig, fs, path, app })
```

**设计原则**：

- **依赖注入而非全局单例**：模块不 `require('electron')` 自己取 API，而是由 main.js 注入（便于单测 mock）。
- **ipc.js 是纯胶水层**：不写业务逻辑，只做"参数校验 → 调各模块方法 → 返回结果"。
- **sidecar 不依赖窗口**：sidecar 模块通过 `callbacks.emit` 回调把事件交给 main.js 转发到渲染层，实现关注点分离。
- **floating 模块通过 `getMainWindow()` / `showMainWindow()` 间接操作主窗口**，避免模块间循环依赖。
- **私钥零泄露**：和风天气私钥只存在主进程内存，渲染层经 IPC 调用，`sanitizeForRenderer` 把回传值整理为 `*configured*` 掩码。

### 4.2 启动流程

```
app.commandLine.appendSwitch(...)       # V8/Chromium 性能参数（必须在 whenReady 前）
process.on('uncaughtException'/...)     # 全局异常 → electron-log
app.requestSingleInstanceLock()         # 单实例锁，防止多开
  └─ gotTheLock?
       ├─ 否 → app.quit()
       └─ 是 → app.on('second-instance')  # 重复启动 → 呼出主窗口（--hidden 实例除外）
            → app.whenReady()
                ├─ createCipherModule()          # ★ 加密模块：safeStorage 可用性校验 + 密钥加载/创建
                │     └─ 不可用时降级为透传（明文），状态如实暴露
                ├─ createDataStore() + store.load()  # ★ 加密数据存储：读 .enc / 旧明文自动迁移 / 损坏自愈
                ├─ dynamic import atomically → atomicWriteRef
                ├─ 创建 archivesDir (userData/archives/)
                ├─ 实例化其余领域模块（archive/bg/autoLaunch/backup/sidecar/window/floating/docsSync/qweather/updater）
                ├─ updater.setup()               # ★ 注册 autoUpdater 状态机事件监听
                ├─ setupIpc()                    # 注册 41 个 IPC handler
                ├─ bg.cleanupBgCache()           # 清理背景图缓存
                ├─ autoLaunch.removeDevAutoLaunchEntry()  # 清理旧开发版自启项
                ├─ windowMod.createWindow()      # 创建主窗口（无边框）
                ├─ windowMod.createTray()        # 创建系统托盘
                ├─ docsSync.sync()               # ★ 后台异步拉取协议/文档（不阻塞）；变化则 emit 'docs:updated'
                └─ updater.check()               # ★ 启动静默检查更新（发现新版不打扰）
```

> **注意**：v1.0.0 起已弃用 electron-store，改用自实现的 `main/data-store.js` 加密存储（详见 4.10）。`--hidden` 启动参数控制开机自启时以后台模式启动（不显示窗口）。

### 4.3 constants.js — 共享常量

| 常量                            | 值                                  | 说明                          |
| ----------------------------- | ---------------------------------- | --------------------------- |
| `BG_SOURCES`                  | upx8 / xxapi                       | 背景图源（名称 + 302 跳转 API）       |
| `BG_MAX_CACHE_FILES`          | 6                                  | 背景图缓存上限（大屏场景 6 张无重复感）      |
| `BG_MAX_BYTES`                | 20MB                               | 单张背景图上限                    |
| `BG_TIMEOUT_MS`               | 30s                                | 下载超时                       |
| `RUN_KEY`                     | `HKCU\...\Run`                     | 开机自启注册表路径                  |
| `SIDECAR_MAX_CONSECUTIVE_CRASHES` | 8                              | 连续崩溃阈值，超过停止自动重启            |
| `SIDECAR_STDOUT_MAX_BYTES`    | 1MB                                | stdout 单行缓冲上限，防无限缓冲        |
| `STORE_DEFAULTS`              | `{settings:null, subjects:null, homeworks:[]}` | electron-store 默认值 |
| `BROWSER_WINDOW_DEFAULTS`     | 1100×760 / min 360×480             | 主窗口尺寸                      |

### 4.4 archive.js — 按月归档

| 函数                                    | 签名                                  | 说明                                          |
| ------------------------------------- | ----------------------------------- | ------------------------------------------- |
| `getCutoffDate()`                     | `→ Date`                            | 归档截止日期：当前月份往前推 3 个月的 1 号 0 点              |
| `getMonthKey(date)`                   | `(date) → string`                   | 生成归档月份键，格式 `YYYY-MM`                        |
| `parseDateLocal(dateStr)`             | `(string) → Date`                   | 本地时区解析日期字符串（避免 UTC 偏移）                      |
| `atomicWriteFileSync(filePath, data)` | `(string, string) → void`           | 原子写入：优先 atomically 库，降级为 tmp+rename（同时被 backup 模块复用） |
| `safeReadArchive(filePath)`           | `(string) → Array`                  | 安全读取归档 JSON；损坏时重命名为 `.corrupted.<ts>.bak` 备份 |
| `archiveHomeworks(homeworks)`         | `(Array) → Array`                   | **核心归档逻辑**：将超期作业按月归档，返回仍活跃的作业数组             |
| `loadDataInternal()`                  | `→ {homeworks, subjects, settings}` | 读取 store 数据并触发归档筛选（save 时不再归档）              |
| `getArchiveMonths()`                  | `→ string[]`                        | 扫描 archives 目录，返回已归档月份键列表（升序）              |
| `loadArchiveByMonth(monthKey)`        | `(string) → Array`                  | 读取指定月份的归档数据                                 |
| `validateData(data)`                  | `(object) → boolean`                | 轻量参数校验：类型检查 + homeworks 上限 10000 条          |

**归档算法**（仅在 `data:load` 时触发，`data:save` 时直接存储不再归档）：

```
输入: homeworks (全部作业)
  ├─ cutoff = 当前时间 - 3 个月（月首 0 点）
  ├─ 遍历每条作业，确定其日期：hw.date → hw.id 时间戳 → 当前时间
  ├─ 日期 >= cutoff → 保留 active
  │  日期 <  cutoff → 按 getMonthKey 分组到 toArchive{YYYY-MM: [...]}
  └─ 对每个待归档月份：读取已有归档 → Map<id> 去重合并 → 原子写入
输出: active
```

设计要点：归档**幂等**（id 去重）、损坏文件**备份不丢弃**、写入**原子**。

### 4.5 background-cache.js — 背景图缓存

| 函数                              | 说明                                                          |
| ------------------------------- | ----------------------------------------------------------- |
| `getBgApiUrl()`                 | 根据 settings.bgSource 返回图源 URL（upx8 或 xxapi）                 |
| `getBgCacheDir()`               | 返回背景图缓存目录 `userData/bg-cache/`                              |
| `isValidBgImage(filePath)`      | **图片完整性校验**：检测 JPEG/PNG/WebP/GIF 魔数头尾，防缓存损坏图               |
| `detectBgExt(filePath)`         | 通过文件头检测图片格式，返回扩展名                                          |
| `readBgIndex()` / `writeBgIndex(index)` | 读写缓存索引 `bg-cache/index.json`（current + files 列表）         |
| `cleanupBgCache()`              | 清理 .tmp 文件 + 校验缓存图片有效性 + 索引修正（启动时调用）                       |
| `pickCachedBackground()`        | 返回当前缓存图（无网络时用）的 file:// URL                                |
| `pickRandomCachedBackground()`  | 随机返回一张缓存图（下载失败时兜底）                                          |
| `downloadBgImage(tmpPath)`      | **下载背景图**：net.request + 超时 30s + 大小上限 20MB + 流式写临时文件        |
| `fetchAndCacheBackground()`     | 下载→校验→重命名→更新索引→驱逐超限旧图（防并发：bgFetchInFlight 锁）               |

### 4.6 auto-launch.js — 开机自启

| 函数                              | 说明                                                          |
| ------------------------------- | ----------------------------------------------------------- |
| `getPreferredAutoLaunchPath()`   | 自启路径：打包版用 process.execPath，开发版优先用 dist 解包版 exe           |
| `getAutoLaunchArgs(launchPath)`  | 启动参数：开发模式带项目路径 + `--hidden`，打包版只带 `--hidden`             |
| `getAutoLaunch()`                | 读取 `app.getLoginItemSettings` 判断是否已开启自启                    |
| `setAutoLaunch(enabled)`         | 写入 Windows 登录项（`HKCU\...\Run`），开启/关闭开机自启                   |
| `removeDevAutoLaunchEntry()`     | 打包版启动时清理旧的开发版自启项（匹配 electron.exe 路径），避免双开                  |

### 4.7 backup.js — 备份与恢复（文件读写）

> 业务组装在渲染层 `src/scripts/backup.js`，本模块只做"对话框 + 文件读写 + 归档合并"。

| 函数                            | 签名                                            | 说明                                              |
| ----------------------------- | --------------------------------------------- | ----------------------------------------------- |
| `exportBackup({suggestedName, payload})` | `→ {success, filePath?, canceled?}` | 弹保存对话框，用户自选路径，原子写 JSON                          |
| `importBackup()`               | `→ {success, data?, filePath?, canceled?}`    | 弹打开对话框，读取并解析 JSON                               |
| `createSnapshot(data)`         | `(data) → {success, filePath}`                | **恢复前自动快照**：写入 `userData/restore-snapshots/restore-<ts>.json`，优先用渲染层传来的最新内存数据，缺省回落 electron-store |
| `collectArchives()`            | `→ {'YYYY-MM': [homeworks]}`                  | 收集全部归档，供"备份作业（含归档）"一并导出                        |
| `restoreArchives(archives)`    | `(archives) → {success, restoredCount, monthCount}` | 写回归档：按月份文件合并（id 去重），月份 key 白名单 `^\d{4}-\d{2}$` 校验 |

### 4.8 floating.js — 浮窗模式（画中画）★

**核心模型**：每个作业卡片 = 一个独立的无边框透明置顶 BrowserWindow（`frame:false, transparent:true, alwaysOnTop:true, skipTaskbar:true, sandbox:true`）。卡片样式与主窗口完全一致（复用 `.homework-card` + `blur-card-off` 实色追色）。

**布局常量**：

| 常量               | 值     | 说明                          |
| ---------------- | ----- | --------------------------- |
| `WIN_PAD`        | 12    | 透明边距（给 CSS 阴影留空间）           |
| `CARD_W`         | 342   | 卡片宽度 ≈ 主窗口 3 列卡片宽度         |
| `GAP_X/GAP_Y`    | 12    | 浮窗间距                        |
| `PROBE_W`        | 26    | 贴边后露出的探头宽度                 |
| `PREVIEW_W`      | 60    | 预展时额外探出的宽度                 |
| `DOCK_ANIM_MS`   | 240   | 贴边/预展/滑出动画时长               |
| `DOCK_HOVER_HOT` | 90    | 屏幕边缘热区宽度（鼠标进入则预展，固定不随窗口移动） |
| `DOCK_HOVER_MS`  | 80    | 鼠标位置轮询间隔                   |

**主要方法**：

| 方法                                    | 说明                                                              |
| ------------------------------------- | --------------------------------------------------------------- |
| `enter(cards)`                        | 进入浮窗：`forceCleanup()` 强制清理旧状态（消除退出→再进入竞态）→ 按内容长度排序 → 并行创建全部浮窗（4s 超时）→ 等高度测量（最多 3.5s）→ **布局只执行一次** → 隐藏主窗口 |
| `cardReady(wcId, height)`             | 浮窗渲染层上报自然高度，只记录不触发布局（上限=整屏工作区高度，仅超屏内容才截断滚动）         |
| `layoutAndShow()`                     | 默认布局：主显示器右侧第一列从上往下，超出底部 → 左侧加列；x 有下界 clamp 不出屏 |
| `exit()`                              | 退出：先显示主窗口 → 通知所有浮窗播渐出动画 → 700ms 兜底后强制销毁；**幂等**（重复调用不重复发指令） |
| `closeCard(wcId)`                     | 关闭此浮窗：卡片从显示移除（数据保留），`float:card-hidden`；全部关完自动 exit |
| `dockCard(wcId)`                      | 贴边隐藏：按窗口中心在屏幕左/右半区决定贴边方向，收缩为探头宽度并**整窗保持在屏幕内**（窗口移出屏幕后 Chromium 不渲染内容） |
| `previewEntry/unpreviewEntry`         | 预展/缩回：探头向屏幕内滑出一段                        |
| `startDockHover(entry)`               | 屏幕边缘热区轮询：鼠标进入热区预展、离开缩回（热区固定，不随窗口移动，避免抖动循环） |
| `setHoverMode(wcId, enabled)`         | 渲染层上报设备类型：鼠标设备启用热区轮询，触屏禁用（交给点击逻辑）       |
| `undockCard(wcId)`                    | 完全滑出：恢复完整大小，回到贴边前位置                     |
| `closeAfterFade(wcId)`                | 浮窗渐出动画播完后销毁该窗口                          |
| `getCardForWebContents(wcId)`         | `float:init` 用：按 webContents id 找到对应卡片数据    |

**关键修复记录（2026-08）**：

- **高度自适应（二次返工）**：`height:auto` 对 `absolute+inset` 卡片无效 → 改为临时解放 bottom/height 约束测真实自然高度 + 放宽主进程单卡高度上限。
- **布局单点执行**：布局只由 `enter()` 执行一次，`cardReady` 仅记录高度，消除"跳位"。
- **no-drag 陷阱**：`-webkit-app-region:no-drag` 仅在拖拽元素的**后代**上生效，兄弟节点不生效——因此 `⋯` 按钮与菜单必须放在卡片内部。
- **`will-change:transform` 陷阱**：卡片上的 `will-change` 会把 `position:fixed` 变成相对卡片定位——浮窗控件改用 `position:absolute` 相对卡片。

### 4.9 window.js — 主窗口与托盘

| 函数                  | 说明                                                                       |
| ------------------- | ------------------------------------------------------------------------ |
| `createWindow(forceShow)` | 创建 BrowserWindow（1100×760，最小 360×480，**无边框** `frame:false`，`paintWhenInitiallyHidden`） |
| `createTray()`       | 创建系统托盘（图标 + 右键菜单：显示主界面/退出），单击托盘显示窗口                                      |
| `showMainWindow()`   | 显示主窗口：restore + maximize + show + focus（用 setAlwaysOnTop 技巧强制置顶）          |

窗口配置（常量在 `constants.js`）：

```js
new BrowserWindow({
    width: 1100, height: 760,
    minWidth: 360, minHeight: 480,    // 适配小屏/平板
    title: '班级工作台',
    icon: '图标.ico',
    backgroundColor: '#eef2f0',       // 与开屏背景一致，避免白闪
    autoHideMenuBar: true,
    frame: false,                     // 无边框窗口（自定义关闭按钮）
    show: false,                      // ready-to-show 后才显示，避免白屏
    paintWhenInitiallyHidden: true,   // 隐藏时仍渲染（后台截图等）
    webPreferences: {
        preload: 'preload.js',
        nodeIntegration: false,       // 安全：关闭 Node 集成
        contextIsolation: true,       // 安全：开启上下文隔离
    }
})
```

**托盘行为**：有关闭窗口时不退出，而是隐藏到托盘（`mainWindow.hide()`）；真正退出走托盘菜单的"退出"或 `before-quit` 事件（同时停止 sidecar）。

### 4.10 data-cipher.js + data-store.js — 加密数据存储层 ★

> 自实现加密数据存储，**替代 electron-store**。两层设计：`data-cipher.js` 提供加密原语（独立、可复用），`data-store.js` 提供与 electron-store 兼容的 `get/set` 内存接口 + 显式 `flush()` 落盘。所有敏感数据（作业/学科/设置/QQ 老师绑定）均走此加密通道，**密钥不会以明文形式落盘**。

#### 4.10.1 data-cipher.js — 加密原语

| 项 | 说明 |
| -- | --- |
| 算法 | AES-256-GCM（Node `crypto` 内置，硬件加速，亚毫秒级；GCM 自带完整性认证） |
| 密钥 | 32 字节 `crypto.randomBytes`，仅生成一次，**内存缓存**避免重复读盘 |
| 密钥保护 | Electron `safeStorage.encryptString`（Windows = DPAPI，仅当前 Windows 用户能解）→ 加密后写入 `userData/.cbw-key` |
| 密文格式 | `CBW1:<iv(base64)>:<tag(base64)>:<ciphertext(base64)>`（版本头 `CBW1:` 便于向后兼容升级） |
| IV | 每次加密重新生成 12 字节随机 IV（GCM 推荐 12 字节） |
| AuthTag | 16 字节 GCM 认证标签；密文被篡改/损坏时 `decryptText` **必然抛错**（天然完整性校验） |
| 降级 | `safeStorage.isEncryptionAvailable()` 不可用时，`createCipherModule` 抛错；`main.js` 捕获后用透传 stub 替代（`encryptText/decryptText` 直接返回原值），状态暴露为"明文降级"，**绝不让应用无法启动** |

| 函数 | 签名 | 说明 |
| --- | --- | --- |
| `getKey()` | `→ Buffer(32)` | 加载/创建密钥：读 `.cbw-key` → `safeStorage.decryptString` → base64 解码；不存在则随机生成 → 加密落盘 |
| `encryptText(plain)` | `(string) → string` | 同步加密：`createCipheriv('aes-256-gcm')` → 拼接 IV/Tag/密文为 `CBW1:...` |
| `decryptText(payload)` | `(string) → string` | 同步解密：解析三段 base64 → `setAuthTag` → `final()`；格式错误或 AuthTag 校验失败抛异常 |
| `status()` | `→ {enabled, algorithm, keyProtection, keyFile}` | 加密状态查询，供设置面板展示（算法 / 密钥保护方式 / 密钥文件路径） |

#### 4.10.2 data-store.js — 加密存储

> 接口与 electron-store 兼容（`get/set`），但持久化改为显式 `await flush()`。**双层容错**：自动兼容密文/明文，损坏文件备份不覆盖。

**文件布局**：

| 文件 | 用途 |
| --- | --- |
| `userData/homework-data.enc` | ★ 加密主数据文件（默认，AES-256-GCM 密文） |
| `userData/homework-data.json` | 旧版明文（仅加密关闭时使用；首次迁移后改名 `.legacy.bak` 保留） |
| `userData/.cbw-key` | 加密密钥（DPAPI 加密后落盘，仅当前 Windows 用户能解） |

**加密开关**：`settings.dataEncryption !== false` 即启用（向导可选择，默认开启）。切换开关时，另一种格式的旧文件会被改名为 `.legacy.bak` 保留，避免歧义。

| 函数 | 签名 | 说明 |
| --- | --- | --- |
| `load()` | `→ void` | 同步加载：优先读 `.enc` → 失败兜底读 `.json` → 全失败则备份损坏文件后用默认值。**自动迁移**：仅存在 `.json` 时加载并标记，下次 save 时落盘为 `.enc` |
| `get(key, def)` | `(string, any) → any` | 读取内存值（兼容 electron-store 接口） |
| `set(key, value)` | `(string, any) → void` | 写入内存并标记 dirty，**不立即落盘** |
| `save()` | `→ Promise<boolean>` | 加密落盘：根据开关走 `cipher.encryptText` 或明文 → 原子写（tmp + rename）→ 清 dirty；**串行队列**防并发覆盖 |
| `flush()` | `→ Promise<void>` | 确保变更落盘：dirty 时触发 save，再等待队列完成 |

**容错策略**：

```
load() 启动时：
  ├─ .enc 存在 → loadFromFile(.enc)
  │    ├─ 成功 → 返回（正常加密路径）
  │    └─ 失败（密钥变更/文件损坏）→ 尝试 .json 兜底
  │         ├─ .json 存在且可读 → 加载并标记迁移（warn 日志）
  │         └─ 否则 → backupCorrupted(.enc) + 用默认值
  └─ .enc 不存在
       ├─ .json 存在 → loadFromFile(.json)（旧明文，自动迁移）
       └─ 都不存在 → 用默认值（首次安装）

loadFromFile() 兼容：
  ├─ 内容以 "CBW1:" 开头 → cipher.decryptText → JSON.parse
  └─ 否则 → 当作明文 JSON.parse（兼容旧版/导出文件）

save() 加密开关：
  ├─ dataEncryption !== false → 写 .enc + 旧 .json 改名 .json.legacy.bak
  └─ dataEncryption === false → 写 .json + 旧 .enc 改名 .enc.legacy.bak
```

**安全特性总结**：

| 特性 | 实现 |
| --- | --- |
| 防磁盘扫描 | 数据文件 `.enc` 为密文，直接打开是乱码；密钥 `.cbw-key` 经 DPAPI 加密，复制到其他电脑无法解 |
| 防篡改 | AES-256-GCM AuthTag 校验，密文被改一个字节解密必失败 |
| 防密钥泄露 | 密钥仅在主进程内存中存在；渲染层通过 IPC 间接访问数据，**永远拿不到密钥** |
| 用户可关 | 设置面板可关闭加密（向导首启可选），关闭后以明文存储并如实暴露状态 |
| 跨用户隔离 | DPAPI 密钥绑定当前 Windows 用户，换用户登录无法解密 |
| 降级安全 | safeStorage 不可用时降级为透传（明文），状态如实暴露给用户，**不静默失败** |
| 备份兼容 | 备份导出永远为明文 JSON（用户主动导出），导入时主进程重新加密落盘 |

### 4.11 docs-sync.js — 协议/文档在线同步 ★

> 启动时后台异步拉取线上最新协议/文档（AGREEMENT/PRIVACY/SECURITY/OPENSOURCE/CONTACT），三源兜底 + SHA-256 比对落盘缓存。**主仓库（GitHub）为唯一真源**；jsDelivr/raw 自动跟随主仓库 master 分支，GitHub Pages 由发布脚本同步。缓存目录 `userData/doc-cache/`。

**三源兜底顺序**（主进程 `net.fetch`，绕过渲染层 CSP）：

1. `https://{OWNER}.github.io/{SITE_REPO}/docs/`（GitHub Pages，内地相对稳）
2. `https://cdn.jsdelivr.net/gh/{OWNER}/{REPO}@master/`（jsDelivr CDN）
3. `https://raw.githubusercontent.com/{OWNER}/{REPO}/master/`（raw 直链，权威但内地不稳）

| 常量 | 值 | 说明 |
| --- | --- | --- |
| `PER_SOURCE_TIMEOUT` | 6000ms | 单源超时，整链最多约 18s |
| `SYNC_TTL_MS` | 12h | 距上次成功同步不足该时长且缓存有效 → 跳过网络拉取 |

| 函数 | 说明 |
| --- | --- |
| `parseVersion(md)` | 从文档顶部 `**版本：vX.Y.Z**` 提取 semver，用于判断是否重新确认协议 |
| `readDoc(name)` | 读取生效内容：在线缓存优先，无缓存回退随应用分发的源文件（损坏容错） |
| `readBundled(name)` | 仅读随应用分发的源文件 |
| `fetchDoc(name)` | 单文档三源兜底拉取：每个源 `AbortController` + 超时，失败自动切下一源 |
| `sync()` | **一次性同步全部文档**：TTL 短路 → 并行拉取 → SHA-256 比对 → 变更才落盘 → 返回 `{changed, effective, failed}` |
| `sourceFor(name)` | 本地生效对象最近一次成功来源（无则空串） |

> **TTL 缓存**：所有文档缓存均在 12h 内且文件存在 → 直接返回 `{fresh:true}`，不产生网络请求也不触发 `<changed>`。

### 4.12 qweather-auth.js — 和风天气 JWT 认证 ★

> 和风推荐用 JWT（Ed25519）替代旧 API Key（旧 v7 warning 接口已废弃返回 403）。**私钥只存在于主进程**，渲染层永远拿不到。

| 函数 | 签名 | 说明 |
| --- | --- | --- |
| `generateToken({kid, sub, privateKey})` | `→ string` | 生成 JWT：header 仅 `{alg:'EdDSA', kid}`，payload 仅 `{sub, iat(now-30s), exp(now+900s)}`；用 `crypto.sign(null,...)` 单次签名（Ed25519 不能用 createSign 流水线） |
| `generateKeyPair()` | `→ {privateKey, publicKey}` | 生成本地 Ed25519 PKCS8/SPKI PEM 密钥对（设置界面"一键生成"） |
| `get({host, cfg, endpoint, query})` | `→ Promise<JSON>` | 发起带 `Authorization: Bearer <token>` 的 GET 请求；403 时作废缓存重签一次 |
| `getToken(cfg)` | `→ string` | 令牌缓存：同一配置距 exp ≤120s 才重新签名，避免 15 分钟内重复签名 |

**JWT 结构**：`base64url(header) + '.' + base64url(payload) + '.' + base64url(signature)`，TTL 900s（15 分钟）。

### 4.13 updater.js — 自动更新 ★

> electron-updater + GitHub Releases（`package.json build.publish` 的 `latest.yml`）。**交互全部用户确认**：检查/下载/安装任一步都不自动执行。

| 状态机 | `idle → checking → available → downloading → downloaded → not-available/error` |
| --- | --- |

| 函数 | 说明 |
| --- | --- |
| `setup()` | 注册 autoUpdater 事件：checking/available/not-available/error/download-progress/update-downloaded → 更新 state 并 `emit('updater:event')`；`autoDownload=false`、`autoInstallOnAppQuit=false` |
| `check()` | 检查更新：开发模式直接返回 `{dev:true}`；打包版 `autoUpdater.checkForUpdates()` |
| `download()` | 用户确认后 `autoUpdater.downloadUpdate()`（仅 `available` 状态） |
| `install()` | 用户确认后 `quitAndInstall()`（仅 `downloaded` 状态，触发 before-quit 停 sidecar） |
| `latestNotes()` | 拉取 GitHub 最新 release 说明（更新日志）：运行期缓存 + 并发去重 + 开发模式不打 API |
| `getState()` | 返回当前状态快照 `{status, currentVersion, version, percent, error, releaseNotes}` |

> **更新日志去重**：同一会话只拉一次 GitHub API（`notesCache`/`notesPromise`），避免限流。检查更新有 404 误报时按 `state.status === 'not-available'` 过滤。

---

## 5. 预加载脚本（preload.js / floating-preload.js）

### 5.1 preload.js — 主窗口桥接

通过 `contextBridge.exposeInMainWorld('electronAPI', ...)` 向渲染进程暴露以下 API：

| API                          | IPC 通道              | 说明                                                          |
| ---------------------------- | ------------------- | ----------------------------------------------------------- |
| `loadData()`                 | `data:load`         | 加载全部活跃数据（settings + subjects + homeworks，homeworks 已自动归档筛选） |
| `saveData(data)`             | `data:save`         | 保存全部数据（保存时不再触发归档）                                          |
| `exportBackup(name, payload)`| `data:exportBackup` | 备份设置/作业：弹保存对话框导出 JSON                                      |
| `importBackup()`             | `data:importBackup` | 恢复备份：弹打开对话框读取 JSON                                          |
| `createRestoreSnapshot(data)`| `data:createSnapshot` | 恢复前自动快照当前数据                                                |
| `getArchives()`              | `data:getArchives`  | 收集全部归档数据（含归档备份用）                                           |
| `restoreArchives(archives)`  | `data:restoreArchives` | 写回归档（按月合并去重）                                               |
| `floatEnter(cards)`          | `float:enter`       | 进入浮窗模式（传入卡片数组）                                            |
| `floatExit()`                | `float:exit`        | 退出浮窗模式                                                     |
| `onFloatCardBack(cb)`        | `float:card-back` (事件) | 单卡放大回主窗口                                                  |
| `onFloatCardHidden(cb)`      | `float:card-hidden` (事件) | 单卡关闭                                                      |
| `onFloatExited(cb)`          | `float:exited` (事件) | 浮窗模式彻底退出                                                  |
| `archiveGetMonths()`         | `archive:getMonths` | 获取已归档月份列表（只读）                                               |
| `archiveLoadMonth(monthKey)` | `archive:loadMonth` | 加载指定月份归档数据（只读）                                              |
| `getBackground()`            | `bg:get`            | 获取当前缓存的背景图 URL                                              |
| `refreshBackground()`        | `bg:fetch`          | 下载新背景图并缓存，返回 URL                                           |
| `getAutoLaunch()`            | `app:getAutoLaunch` | 读取开机自启状态                                                    |
| `setAutoLaunch(enabled)`     | `app:setAutoLaunch` | 设置开机自启                                                      |
| `windowControls.close()`     | `window:close`      | 关闭主窗口                                                       |
| `copyLayoutImage()`          | `page:copy`         | 截取当前页面写入剪贴板                                                 |
| `openExternal(url)`          | `shell:openExternal`| 打开外部链接（浏览器）                                                 |
| `qq.toggle(enabled)`         | `qq:toggle`         | 启动/停止 QQ sidecar（配置由主进程从 store 自取）                         |
| `qq.getStatus()`             | `qq:getStatus`      | 查询 sidecar 运行状态（running/pid/lastError）                     |
| `qq.updateConfig()`          | `qq:updateConfig`   | 更新配置并重启 sidecar                                             |
| `qq.onNotification(cb)`      | `qq:notification` (事件) | 订阅 QQ 通知事件                                                  |
| `qq.onStatus(cb)`            | `qq:status` (事件)    | 订阅 sidecar 状态变化                                             |
| `qq.onError(cb)`             | `qq:error` (事件)     | 订阅错误事件                                                      |
| `qweather.get(args)`         | `qweather:get`        | 和风 API 请求（`{endpoint, query?, lat?, lon?}`）→ `{ok, data}`  |
| `qweather.getToken()`        | `qweather:getToken`   | 生成一次 JWT 令牌（设置面板校验/预览）                                   |
| `qweather.genKeyPair()`      | `qweather:genKeyPair` | 生成本地 Ed25519 密钥对（`{ok, privateKey, publicKey}`）           |
| `readDoc(name)`              | `docs:read`           | 读取协议/文档（在线缓存优先，回退内置源文件）                                   |
| `getDocVersions()`           | `docs:getVersions`    | 在线/内置文档版本号（判断协议是否更新）                                      |
| `onDocsUpdated(cb)`          | `docs:updated` (事件)  | 后台同步完成且有文档变化（含 changed 清单）                                  |
| `getVersion()`               | `app:getVersion`      | 应用版本号（来自 package.json）                                     |
| `update.check()`             | `updater:check`       | 检查更新（返回立即结果，后续状态靠 onEvent 推送）                              |
| `update.download()`          | `updater:download`    | 用户确认后开始下载                                                   |
| `update.install()`           | `updater:install`     | 用户确认后退出并安装                                                  |
| `update.getState()`          | `updater:state`       | 拉取当前更新状态快照                                                  |
| `update.releaseNotes()`      | `updater:release-notes` | 拉取 GitHub 最新 release 说明（更新日志）                              |
| `update.onEvent(cb)`         | `updater:event` (事件)  | 订阅更新状态机事件（checking/available/progress/downloaded/not-available/error） |
| `getCipherStatus()`          | `app:cipherStatus`    | 数据加密状态（算法/密钥保护方式，设置面板展示）                                  |

### 5.2 floating-preload.js — 浮窗窗口桥接 ★

只暴露浮窗所需的最小 IPC 面，无 Node 能力，暴露为 `window.floatingAPI`：

| API                     | IPC 通道                 | 说明                              |
| ----------------------- | ---------------------- | ------------------------------- |
| `init()`                | `float:init`           | 获取本窗口对应的卡片数据                     |
| `ready(height)`         | `float:ready`          | 内容渲染完成，报告自然高度（主进程据此布局）           |
| `closeWindow()`         | `float:close`          | 关闭此浮窗                            |
| `exitAll()`             | `float:exitAll`        | 退出整个浮窗模式（恢复主窗口）                 |
| `dock()`                | `float:dock`           | 贴边隐藏（已贴边则滑出）                    |
| `setHoverMode(enabled)` | `float:setHoverMode`   | 上报设备类型（鼠标=启用热区轮询，触屏=禁用）         |
| `undock()`              | `float:undock`         | 完全滑出：回到贴边前的位置                   |
| `onProbe(cb)`           | `float:probe` (事件)     | 贴边指令：进入探头模式（带方向/学科色）            |
| `onProbeOff(cb)`        | `float:probe-off` (事件) | 滑出指令：退出探头模式                     |
| `onFadeOut(cb)`         | `float:fade-out` (事件)  | 退出渐出指令：播放动画后调 closeAfterFade      |
| `closeAfterFade()`      | `float:closeAfterFade` | 渐出动画播完，通知主进程销毁窗口                |

---

## 6. 渲染进程模块详解

渲染进程共 24 个 JS 文件 + `settings/` 子目录 9 个文件 + `emoji-map.js`，无模块系统，通过 `window.*` 命名空间通信。加载顺序严格按依赖关系排列（见 `index.html` 底部，共 34 个脚本）。

### 6.1 config.js — 全局配置

> 暴露：`window.AppConfig`

| 常量                       | 类型     | 说明                                                                              |
| ------------------------ | ------ | ------------------------------------------------------------------------------- |
| `STORAGE`                | Object | 存储键名（兼容遗留，实际持久化由 electron-store 管理）                                             |
| `DEFAULT_SUBJECTS`       | Array  | 8 个默认学科（语数英物化生史政），各带 id/name/color                                              |
| `areaCoordMap`           | Object | 预置地区的经纬度坐标（旧版固定地区用，现城市可搜索）                                                |
| `GEOCODING_URL`          | string | Open-Meteo 城市搜索 Geocoding API 地址                                               |
| `weatherCodeDict`        | Object | WMO 天气码 → emoji + 中文描述 的映射字典（Open-Meteo 用）                                      |
| `qweatherIconMap`        | Object | 和风天气图标码 → emoji + 中文描述 的映射字典（100~515）                                          |

### 6.2 state.js — 全局状态

> 暴露：`window.AppState`

**状态字段**：`homeworks`（活跃作业）、`subjectList`（学科）、`currentViewDate`（当前查看日期 YYYY-MM-DD）、`settings`（应用设置）。

**默认 settings**：

```js
{
    eveningSections: [...],         // 晚修时段数组
    contentFontSize: 26,            // 作业正文字号(px)（辅助功能三档：20/26/32）
    weatherCities: [],              // 兼容旧版，迁移后不再使用
    openmeteoCities: [],            // Open-Meteo 城市列表 [{id,name,lat,lon,provider,...}]
    qweatherCities: [],             // 和风天气城市列表 [{id,name,locationId,provider,...}]
    weatherProvider: 'openmeteo',   // 'openmeteo' | 'qweather'
    weatherRefreshInterval: 30,     // 天气刷新间隔(分钟)，0=不刷新
    weatherRefreshMode: 'foreground', // 'always' | 'foreground'（默认仅前台更省资源）
    qweatherApiHost: '',            // 和风天气专属 API Host
    qweatherApiKey: '',             // 和风天气 API Key（旧认证，JWT 迁移后保留兼容）
    qweatherKid: '',                // 和风 JWT 凭据 ID（控制台-项目管理查看）
    qweatherSub: '',                // 和风 JWT 项目 ID（sub 签发主体）
    qweatherPrivateKey: '',         // 和风 Ed25519 私钥（PEM，仅主进程用于签名，渲染层不接触）
    alertEnabledLevels: ['blue','yellow','orange','red'], // 预警级别筛选
    bgRefreshInterval: 30,          // 背景刷新频率(分钟)
    bgSource: 'upx8',              // 背景图源 'upx8' | 'xxapi'
    bgRefreshMode: 'foreground',   // 背景刷新模式
    cardColumns: 2,                // 卡片列数(2 或 3)
    autoNumber: true,              // 弹窗回车自动编号
    beautifyNumber: true,          // 卡片编号美化圆圈
    blurBars: true,                // 顶/底栏/Toast 高斯模糊（辅助功能可关）
    blurCard: true,                // 作业卡片高斯模糊
    blurModal: true,               // 模态弹窗高斯模糊
    reduceAnimation: false,        // 减弱动画效果
    qq: {                          // QQ sidecar 配置
        enabled: false,
        teachers: [],              // [{name, subjectId, subjectName}]
        scanIntervalSeconds: 0.5,
        cooldownSeconds: 3,
        keywords: { strong: [...], weak: [...] },
        pendingCandidates: []      // 待确认作业候选队列
    }
}
```

**DOM 引用**：`dom` 对象以懒加载函数形式封装 `document.getElementById`，涵盖时钟、晚修进度、天气、预警胶囊、卡片网格、底栏、模态根、更多菜单等全部关键元素。

### 6.3 utils.js — 工具函数

> 暴露：`window.AppUtils`

| 函数                             | 签名                         | 说明                                        |
| ------------------------------ | -------------------------- | ----------------------------------------- |
| `todayStr()` / `localDateStr(d)` | `→ string`                 | 返回本地时区的 `YYYY-MM-DD`（避免 UTC 偏移）         |
| `parseLocalDate(dateStr)`       | `(string) → Date`          | 本地时区解析日期字符串                               |
| `shiftDateStr(dateStr, delta)`  | `(string, number) → string` | 日期加减天数                                    |
| `escapeHtml(s)`                 | `(string) → string`        | HTML 转义，防 XSS                             |
| `escapeHtmlLines(text)`         | `(string) → string`        | 逐行转义后用 `<br>` 连接                          |
| `hexToRgb(hex)`                 | `(string) → {r,g,b}\|null` | 十六进制色值转 RGB 对象                            |
| `formatNumCircle(text)`         | `(string) → string`        | 将 `1. ` `1、` `1．` 格式行首编号转为圆形数字徽章 HTML       |
| `renderContentBySetting(text, beautify)` | `(string, boolean) → string` | 根据 beautifyNumber 设置选择圆圈美化或原始文本            |
| `toast(msg)`                    | `(string) → void`          | 显示 2.2s 自动消失的 Toast 提示（带 leaving 收缩退场动画）   |

### 6.4 storage.js — 数据持久化

> 暴露：`window.AppStorage`

| 函数                       | 说明                                                                                                    |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| `loadAll()`              | 调用 `electronAPI.loadData()`，填充 state；处理大量默认值回填（天气/背景/QQ 配置兜底、旧版 teachers 字符串数组升级为对象数组、关键词默认词表） |
| `persistHomeworks(newHW)` | **先更新内存并排队写盘；写盘失败时回滚内存**，保持 UI 与磁盘一致。返回 boolean                                                        |
| `saveHomeworks()`        | 排队写盘（走串行队列）                                                                                           |
| `saveSettings()`         | 排队写盘                                                                                                  |
| `saveSubjects()`         | 排队写盘                                                                                                  |

**串行保存队列**：所有保存入口走同一 `_persistChain` Promise 链（`_persist()` → `runSave()`），防止并发保存互相覆盖。每次 `runSave()` 执行时重新读取最新 state，避免旧快照覆盖新改动。

### 6.5 styling.js — 样式应用

> 暴露：`window.AppStyling`

| 函数               | 说明                                                                        |
| ---------------- | ------------------------------------------------------------------------- |
| `applyStyling()` | 应用设置中的字号（`--font-size-content`）、计算 accent 的 RGB 值（`--accent-rgb`）、设置背景层底色 |
| `initStyling()`  | 初始化时调用 applyStyling                                                       |

### 6.6 weather.js — 天气加载（双 API + 多城市 + 预警）★

> 暴露：`window.AppWeather`

根据 `settings.weatherProvider` 自动切换 Open-Meteo / 和风天气；城市不固定预设地区，而是**用户搜索添加的多城市列表**（显示第一个城市）。

| 函数                              | 说明                                                                  |
| ------------------------------- | ------------------------------------------------------------------- |
| `loadWeather(city)`             | 根据 city.provider 分发：Open-Meteo 用坐标查 /forecast；和风天气用 LocationID 查 /v7/weather/now（新版专属 Host + JWT 认证） |
| `searchCities(keyword)`         | **统一城市搜索入口**：Open-Meteo 用 Geocoding API（过滤 PPL 人口聚居地，带请求序号防竞态）；和风用 GeoAPI `/geo/v2/city/lookup`（返回并缓存 lat/lon）。返回统一格式 `[{id, name, provider, lat/lon 或 locationId, ...}]` |
| `setupWeatherRefresh()`         | 启动定时刷新（weatherRefreshInterval + weatherRefreshMode），监听 visibilitychange 回前台时补刷 |
| `restartWeatherRefresh()`       | 设置变更后重启定时器                                                          |
| `refreshAlerts()`               | 拉取和风天气预警 `/weatheralert/v1/current/{lat}/{lon}`（用第一个城市的经纬度），过滤后渲染顶栏预警胶囊            |
| `refilterAlerts()`              | 预警级别筛选变更后即时重新过滤（不重新请求）                                              |

**双实现**：

- **Open-Meteo** (`loadOpenMeteo`)：`api.open-meteo.com/v1/forecast?...&current=temperature_2m,weather_code`，`weatherCodeDict` 转 emoji。
- **和风天气** (`loadQweather`)：需要 Host + JWT 凭据（kid / sub / Ed25519 私钥，配置在设置弹窗）；`qweatherFetch()` 统一封装（渲染层经 IPC 调主进程 `qweather:get`，主进程用 `qweather-auth.js` 生成 JWT 并以 `Authorization: Bearer <token>` 请求，**私钥只存在于主进程**）；`/v7/weather/now` 实时天气，`qweatherIconMap` 转 emoji；未配置时提示并显示"未配置 API"。

**天气预警**（仅和风天气）：

- 蓝色 / 黄色 / 橙色 / 红色四级，`normalizeAlertLevel()` 同时识别英文 severityColor 和中文级别名。
- 顶栏预警胶囊显示最高级别预警（配色按级别），多条时显示 `+N`，点击展开详情模态框（发布单位/时间/生效时段/正文）。
- 可在设置中按级别筛选（`alertEnabledLevels`）。

**身份认证（JWT）**：和风旧版 `/v7/warning/now` 接口已废弃（返回 403 Deprecated），URL 认证的 API Key 逐步被 JWT 取代。本软件已完整迁移为 JWT（EdDSA/Ed25519）：

- header：`{alg:'EdDSA', kid}`；payload：`{sub, iat: now-30, exp: now+900}`；签名用 `crypto.sign(null, signingInput, key)`（不能用 createSign 流水线，Node 22 会报 Invalid digest）。
- 每次请求动态签一个新鲜令牌，主进程统一签发与请求，渲染层始终不接触私钥。

**离线缓存**：天气数据缓存到 `localStorage`（30 分钟 TTL），网络失败时降级显示缓存数据（过期则标注"离线"）。

**刷新模式**：

- `always`：始终按间隔刷新（即使窗口在后台）
- `foreground`（默认）：窗口在后台时暂停刷新，回到前台时若已超时立即刷新

### 6.7 background.js — 背景图（IPC 缓存模式）

> 暴露：`window.AppBackground`

| 函数                                | 说明                                                          |
| --------------------------------- | ----------------------------------------------------------- |
| `initBackground()`                | 先取缓存图显示 → 再请求新图替换（断网时保留缓存图）                                 |
| `refreshBackground()`             | 请求新图（保留当前图直到新图加载成功，避免闪回米白背景）                                |
| `setupBgRefresh(intervalMinutes)` | 设置定时刷新（0 = 不刷新），支持前台/后台刷新模式                                 |
| `restartBgRefresh()`              | 设置变更后重启定时器                                                  |

背景图下载和缓存完全由主进程负责（`bg:get` / `bg:fetch` IPC），渲染层只调用 IPC 获取 file:// URL 并用 `new Image()` 解码显示。断网时仍能显示本地缓存图。

### 6.8 layout.js — 布局适配

> 暴露：`window.AppLayout`

| 函数                       | 说明                                                             |
| ------------------------ | -------------------------------------------------------------- |
| `adjustContentPadding()` | 测量顶栏实际高度，动态设置 `body.padding-top` 和 toast 容器 `top`，保证内容不被固定顶栏遮挡 |

### 6.9 renderer.js — 渲染引擎（核心）

> 暴露：`window.Renderer` / `window.AppRenderer`

负责卡片网格、底栏学科按钮、日期显示、时钟和晚修进度的全部渲染。

#### `Renderer` 对象方法

| 方法                         | 说明                                                                                            |
| -------------------------- | --------------------------------------------------------------------------------------------- |
| `renderCards()`            | **渲染作业卡片网格**。按日期筛选（浮窗模式下过滤已浮窗/已隐藏卡片）→ 2列贪心双栏平衡 / 3列 CSS columns 自动排版 → 生成卡片 DOM → 绑定事件。学科色为**整卡追色**（`--card-tint` 实色叠加 + 圆点/标题/数字圈读 `--subject-accent`）。仅新增卡片播放入场动画（`prevCardIds` 判断）。 |
| `renderBottomPills()`      | **渲染底栏学科按钮**。首次创建并缓存节点（subjectsKey 判断重建），后续复用。已有作业的学科显示 `✓` 并收起。**有 QQ 待确认候选时强制显示胶囊 + 红点徽标**。            |
| `updateDateDisplay()`      | 更新底栏日期文本（今天/月日周几）                                                                             |
| `updateEveningProgress()`  | **计算晚修进度**：遍历 eveningSections，判断当前时间是否落在某节内，计算已过时长和百分比，更新进度条                                  |
| `updateClock()`            | 更新时钟显示（每 10 秒由定时器触发），同时调用 updateEveningProgress                                               |
| `renderAll()`              | 全量渲染（卡片 + 底栏 + 日期 + 时钟 + 延时调整 padding）                                                        |
| `renderAllWithAnimation()` | 带淡出动画的全量渲染（日期切换/浮窗退出时使用）                                                                     |

#### 卡片交互逻辑

- **激活态**：点击卡片切换 `card-active`，展开操作按钮（编辑/删除）。点击卡片外部自动收起。
- **编辑**：点击编辑按钮打开修改弹窗。
- **删除（二次确认）**：第一次点删除进入确认态（删除按钮变红放大，5 秒后自动退出确认态）；确认态下再次点击播放 `cardOut` 退场动画后删除。

#### 双栏平衡算法（2 列模式）

```
1. 按内容长度降序排序当日作业
2. 贪心分配：每次把作业放到当前总长度更短的那一栏
3. 交错合并：left[0], right[0], left[1], right[1], ...
```

3 列模式跳过 JS 排序，直接按原始顺序追加，交给 CSS `columns` 自动排版。

#### 入场动画优化

`prevCardIds` 记录上一次渲染的卡片 id 集合。首屏全部逐张错位弹出；后续渲染只有**新增**卡片播放入场动画，避免删/改一张卡时整屏重播。

### 6.10 modal.js — 通用模态框

> 暴露：`window.AppModal`

| 函数                                  | 说明                                                                                        |
| ----------------------------------- | ----------------------------------------------------------------------------------------- |
| `showModal(html, onClose, options)` | 创建 overlay + dialog，注入 HTML，添加 `.modal-open` 标记，自动聚焦首个可交互元素，返回 `{overlay, dialog, close}` |

**关闭机制**：点击 overlay 外部关闭（mousedown+mouseup 双判断防误触）、按 Esc 关闭、支持嵌套弹窗（`options.replace`）。设置内的 API 配置弹窗、备份弹窗、归档视图均以嵌套模态形式叠加在设置面板之上。

### 6.11 dialogs.js — 业务弹窗

> 暴露：`window.AppDialogs`

| 函数                       | 说明                                                                          |
| ------------------------ | --------------------------------------------------------------------------- |
| `openAddDialog(subject)` | 打开添加作业弹窗：textarea + **自动编号开关**（回车自动续写编号，首次预置 `1. `）+ 保存。同科同日已有作业则追加内容。 |
| `openModifyDialog(hw)`   | 打开修改弹窗：预填现有内容 + 自动编号开关，保存时直接修改 hw.content                                   |
| `bindAutoNumber(ta, ref)` | （内部）给 textarea 绑定回车自动编号逻辑                                                  |
| `nextLineNumber(text)`   | （内部）根据最后一行编号计算下一个编号                                                        |

### 6.12 search.js — 作业搜索 ★

> 暴露：`window.AppSearch`（更多菜单 → 作业搜索）

从全部作业中检索并跳转，命中高亮。支持：

| 能力 | 说明 |
| --- | --- |
| 关键词 | 匹配标题 + 内容 + 学科名，多词并关系 |
| 筛选 | 学科胶囊过滤 + 日期范围（起止）+ **包含归档**（经 `archiveGetMonths`/`archiveLoadMonth` IPC 拉取历史） |
| 排序 | 按日期 + 学科，`computeScore` 综合权重评分 |
| 跳转 | 点击结果 → `goToDate()` 切换日期 → `renderAllWithAnimation` + 目标卡片高亮 |
| 减动 | 面板基于对话框式淡入淡出（reduce-anim 下无位移动画） |

| 函数 | 说明 |
| --- | --- |
| `openSearch()` | 打开搜索面板：重置条件 + 焦点输入框 |
| `goToDate(date)` | 跳到某日期并刷新渲染 |
| `openPop()` | 弹出层定位与展示 |
| `highlight(content, kw)` | 内容命中关键词高亮（`<mark>`） |

### 6.13 color-picker.js — 自定义颜色选择器 ★

> 暴露：`window.ColorPicker`

供学科管理面板使用的多色系取色器：

- **内置 5 套色系**（每套 12 色）：经典 / 莫兰迪 / 马卡龙 / 国风 / 自然。
- **交互**：选项卡切换色系 → 色块网格点选 → 回调返回颜色 → 关闭弹出层。
- **弹出层定位**：`positionPopover()` 依据触发按钮位置定位，自动防止超出右/下边界（超下边界时翻转到按钮上方）。
- **关闭**：点击外部（capture 阶段监听）或再次点击触发按钮。

| 方法                                       | 说明                       |
| ---------------------------------------- | ------------------------ |
| `init(triggerBtn, initialColor, onPick)`  | 绑定触发按钮，显示当前颜色，点选回调       |
| `close()`                                | 手动关闭弹出层                  |

### 6.14 archive-renderer.js — 归档视图

> 暴露：`window.ArchiveView`

| 函数                               | 说明                                                     |
| -------------------------------- | ------------------------------------------------------ |
| `mountArchiveView(root, onBack)` | 在指定容器内挂载只读归档视图。初始化时拉取月份列表，默认选最近月份，支持前后翻月、返回设置 |

### 6.15 homework-engine.js — 作业识别引擎 ★

> 暴露：`window.HomeworkEngine`

从 QQ 通知中抽取作业候选的核心引擎。

| 函数         | 签名                              | 说明                          |
| ---------- | ------------------------------- | --------------------------- |
| `extract(notification)` | `(Notification) → Candidate\|null` | 从 QQ 通知抽取作业候选，不达标返回 null    |

**识别流程**：

```
1. 老师匹配（两层）：
   a) 顶层 sender 直接命中老师昵称（私聊场景）
   b) 群聊场景：sender 是群名，从消息体扫描 "老师名：" 提取发送者

2. 学科推断：仅依赖老师-学科映射（手动配置，100% 可靠）
   老师未绑定学科 → 直接放弃

3. 评分（总分 100）：
   - 学科命中 (30)：老师映射 +30 / 无映射 → 放弃
   - 作业意图 (40)：强关键词 +40 / 弱关键词 +30 / 编号列表 +25 / 无 +0
   - 结构特征 (20)：冒号+内容≥4字 +20 / 仅冒号 +10 / 无 +0
   - 内容质量 (10)：页码题号 +10 / 内容≥10字 +5 / 无 +0

4. 阈值：40（学科未命中直接放弃）

5. 日期不自动识别，交给用户通过胶囊控件手动选择
```

**关键词**：用户可在设置面板自定义强/弱关键词（默认：强 = 作业/完成/上交/提交/订正/背诵/默写；弱 = 做/写/复习/预习/练习/答案）。

### 6.16 qq-pending-dialog.js — 待确认作业面板 ★

> 暴露：`window.QQPending`

管理 QQ 自动捕获的作业候选，提供学科胶囊红点提示和批量处理面板。

| 函数 / 方法                    | 说明                                                          |
| -------------------------- | ----------------------------------------------------------- |
| `init()`                   | 订阅 `qq:onNotification` → 引擎抽取 → 入队 → 徽标更新；按需自动启动 sidecar |
| `handleNotification(notif)` | 接收通知 → 引擎抽取 → 去重（sender+rawMessage 哈希）→ 入队（上限 30）→ toast + 徽标 |
| `updatePendingBadge()`     | 更新学科胶囊内联红点徽标（计数，>9 显示 9+）                                   |
| `handlePillClick(subject, openAdd)` | 学科胶囊点击：有候选打开采纳面板，无候选走普通添加                                   |
| `openAdoptDialog(subject, candidates)` | 打开采纳面板                                                     |

**采纳面板交互模型**：

- 候选列表（勾选 + 可编辑 textarea）+ 已有作业展示 + 内联日期胶囊
- 底部操作栏：**保存选中**（每条独立保存为新作业）/ **合并选中**（≥2 条，合并编辑后保存为一条）/ **忽略选中**（从候选队列删除）/ **关闭**（不删除候选）
- 弹窗打开期间收到新候选，实时追加到面板（`_openDialogAppendFn` 钩子）

### 6.17 backup.js — 备份与恢复（渲染层业务）★

> 暴露：`window.AppBackup`

设置按导航面板分组勾选备份；作业按日期范围或全部备份（可选包含归档）；恢复默认"覆盖 + 恢复前自动快照"，可选手动合并。文件读写由主进程 `main/backup.js` 提供。

**设置面板 → 设置字段映射**（备份/恢复粒度 = 设置面板）：

| 面板     | 备份字段                                                                                     |
| ------ | ---------------------------------------------------------------------------------------- |
| 常规设置   | `eveningSections`                                                                          |
| 天气     | `weatherProvider, openmeteoCities, qweatherCities, qweatherApiHost, qweatherApiKey, qweatherKid, qweatherSub, qweatherPrivateKey, alertEnabledLevels, weatherRefreshInterval, weatherRefreshMode` |
| 个性化    | `bgSource, bgRefreshInterval, bgRefreshMode, cardColumns, autoNumber, beautifyNumber`     |
| 辅助功能   | `contentFontSize, reduceAnimation, blurBars, blurCard, blurModal`                        |
| QQ监听   | `qq`（整个对象）                                                                                 |
| 学科管理   | `subjects`（独立数组，special 标记）                                                                |

**备份文件格式**（JSON，`BACKUP_VERSION = 1`）：

```js
{
    app: 'classworkbench',
    version: 1,
    kind: 'settings' | 'homeworks' | 'snapshot',
    createdAt: '<ISO 时间>',
    data: { settings?, subjects?, homeworks?, archives? }  // 按备份内容组合
}
```

**主要入口**：

- `openBackupRestore()` — 备份与恢复管理弹窗（三个动作按钮）
- `openBackupSettingsDialog()` — 勾选模块 → 导出设置 JSON
- `openBackupHomeworkDialog()` — 日期范围/全部 + 可选含归档 → 导出作业 JSON
- `openRestoreDialog()` — 选文件 → 解析校验 → **先自动快照当前数据** → 覆盖恢复或逐项合并（设置按面板粒度、作业按 id 合并、归档走主进程按月合并写回）
- 恢复完成后自动重启天气/背景定时器、重应用样式、全量重渲染

> ⚠️ 备份文件包含和风天气 JWT 私钥等敏感信息，导出弹窗中有明确提示。

### 6.18 settings.js + settings/ — 设置面板 ★

> 暴露：`window.AppSettings`（入口）+ `window.SettingsModules.*`（9 个子模块）

`settings.js` 是组装层：构建 `ctx` 上下文对象（state / 保存函数 / 各工具模块 / 预渲染的选项 HTML），渲染左右分栏骨架（左侧导航 + 右侧 8 个面板），再依次调用各子模块的 `render(ctx)` 与 `bind(ctx)`。

**设置面板八大分类**（对应 `settings/` 下 8 个面板模块 + nav 导航模块）：

| 面板     | 文件                          | 配置项                                                                                     |
| ------ | --------------------------- | --------------------------------------------------------------------------------------- |
| 常规设置   | `settings/general.js`       | 晚修时段（实时校验）、开机自启                                                                          |
| 天气     | `settings/weather.js`       | API 提供商切换、**城市搜索 + 列表管理（拖拽排序/删除）**、和风天气配置（Host + JWT 四字段：kid/sub/私钥，**独立弹窗 + 一键生成密钥对**）、预警级别筛选、刷新频率/模式        |
| 个性化    | `settings/personal.js`      | 背景来源(upx8/xxapi)、背景刷新频率/模式、立即换图、卡片列数、美化编号开关                                              |
| 辅助功能   | `settings/accessibility.js` | **作业字号三档**（小20/中26/大32，分段控制器）、**减弱动画**（body.reduce-anim）、**三路模糊开关**（顶底栏/卡片/弹窗，即时切换 body class） |
| 学科管理   | `settings/subjects.js`      | 学科列表（删除）、添加新学科（名称 + **ColorPicker 五色系取色器**）                                              |
| QQ监听   | `settings/qq.js`            | 监听开关、老师联系人（昵称+学科绑定）、作业关键词（强/弱）、高级参数（扫描间隔/冷却时长）、运行状态实时展示                                  |
| 数据管理   | `settings/data.js`          | 归档作业查看入口、**备份与恢复入口**（打开 AppBackup）、一键清空全部作业（带二次确认）                                      |
| 关于     | `settings/about.js`         | 应用名片/版本号、**检查更新**（electron-updater 状态机交互）、**本次更新日志**、5 个协议文档入口（Markdown 弹窗）                        |

**通用机制**：

- 所有设置项**修改即保存**（change/blur 事件触发），无保存按钮。
- QQ IPC 监听通过 `ctx.qqCleanup` 对象传递清理函数，设置面板关闭时卸载，避免叠加。
- 模态叠加模式：设置面板内再打开的弹窗（和风 API 配置、备份、归档）以 `showModal(html, null, {replace:false})` 嵌套叠加。

### 6.19 floating-mode.js — 主窗口侧浮窗控制 ★

> 暴露：`window.FloatingMode`

| 方法 / 函数                   | 说明                                                                        |
| -------------------------- | ------------------------------------------------------------------------- |
| `enter()`                  | 收集当日可见卡片 → `playLeaveAnimation()`（卡片渐出）→ `api.floatEnter(cards)` → 显示"浮窗模式"横幅 |
| `exit()`                   | `api.floatExit()` → 主窗口恢复渲染（等 `onFloatExited`）                            |
| `shouldHideCard(id)`       | 渲染卡片时过滤已在浮窗中 / 已隐藏的卡片（`floatingIds` / `hiddenIds` 集合）                     |
| `onFloatCardBack`          | 单卡放大回窗 → 从集合移除 → 重新渲染                                                     |
| `onFloatCardHidden`        | 单卡关闭 → 记入 hiddenIds（数据保留，退出浮窗模式时恢复）                                       |
| `onFloatExited`            | 浮窗彻底退出 → 清空集合 → `renderAll()`                                             |

**已知设计限制**：浮窗内容为进入时的**快照**，主窗口改动不实时同步浮窗（退出重进才刷新）。

### 6.20 floating-window.js — 浮窗窗口渲染层 ★

> 文件：`src/scripts/floating-window.js`（由 `floating.html` 加载，不依赖主窗口脚本）

职责：填充卡片内容、设置学科色变量、驱动高度测量、绑定菜单与贴边探头交互。卡片外观直接复用主窗口 `.homework-card` 类（`base.css + components.css`），`body` 挂 `blur-card-off`（实色追色）。

**关键实现**：

- **学科色驱动**：`--subject-accent`（圆点/标题/数字圈）+ `--card-tint`（整卡追色）+ `--font-size-content`，与主窗口 renderer.js 逻辑一致。
- **高度测量**：窗口未显示时 `requestAnimationFrame` 不调度，用 `setTimeout(60ms)`；临时放开 overflow/flex 约束读真实自然高度，+4px 缓冲抵消亚像素取整，然后 `api.ready(h)` 上报。
- **⋯ 菜单**：放大 / 贴边隐藏 / 关闭此浮窗 / 退出浮窗模式；菜单位置按卡片高度夹取防溢出；点击外部 / Esc 关闭。**按钮与菜单必须是卡片后代**（no-drag 仅对 drag 元素后代生效）。
- **整卡拖动**：CSS `-webkit-app-region: drag`（系统级，稳定无 bug），按钮区 `no-drag`。
- **双击卡片 = 贴边隐藏**。
- **贴边探头**：`bindProbe(side, color)` 进入探头模式（探头元素显示学科色 + 方向箭头）；触屏设备点一下预展、再点滑出；鼠标设备点击直接滑出，hover 预展由主进程屏幕边缘热区轮询驱动（渲染层不绑 mouseenter/leave，避免窗口移动引发的抖动循环）。

### 6.21 more-menu.js — 更多菜单 ★

> 暴露：`window.AppMoreMenu`

| 函数 / 方法       | 说明                                  |
| -------------- | ----------------------------------- |
| `init()`       | 绑定底栏"更多"按钮的上拉菜单：点击切换、点击外部关闭、Esc 关闭 |
| `copyLayoutImage()` | 截取当前页面写入剪贴板（`page:copy` IPC），截图前隐藏浮层 |
| `openMenu()` / `closeMenu()` | 手动控制菜单开关                            |

### 6.22 window-controls.js — 自定义窗口控制 ★

> 暴露：无（自执行）

绑定右上角自定义关闭按钮的点击事件，调用 `electronAPI.windowControls.close()`。

### 6.23 datepicker.js — 日期导航

> 暴露：`window.AppDatePicker`

| 函数                                           | 说明                                 |
| -------------------------------------------- | ---------------------------------- |
| `init()`                                     | 绑定底栏日期按钮/前后箭头/点击外部收起事件             |
| `showArrows()` / `hideArrows()` / `toggle()` | 展开/收起前后翻页箭头（通过 `.date-active` 类控制） |
| `changeDate(delta)`                          | 前后翻日期，**限制最早不超过 3 个月前**（更早提示去归档查看） |

### 6.24 main.js — 渲染进程入口

> 文件：`src/scripts/main.js`（非根目录 main.js）

编排启动顺序：

```
1. 依赖检查（关键模块）
2. loadAll()                    # 加载数据
3. initStyling()                # 应用样式
4. Renderer.renderAll()         # 首次渲染
5. loadWeather(第一个城市)       # 加载天气
6. setupWeatherRefresh()        # 启动天气定时刷新
7. initBackground()             # 初始化背景
8. setupBgRefresh(interval)     # 设置背景定时刷新
9. setInterval(updateClock, 10s) # 时钟定时器
10. 绑定 resize / ResizeObserver  # 顶栏高度变化时调整 padding
11. AppMoreMenu.init()          # 更多菜单
12. AppDatePicker.init()        # 日期选择器
13. QQPending.init()            # QQ 监听初始化（订阅 + 自动启动）
```

---

## 7. QQ Sidecar 子进程

> 可执行文件：`sidecar/qq-listener/.../qq-listener.exe`　|　技术：C# .NET 8 (win-x64, AOT publish)

### 7.1 职责

监听 Windows 通知中心的 QQ 消息通知，过滤后通过 stdout 以 NDJSON（每行一个 JSON）格式输出给主进程。

### 7.2 配置传递

主进程将配置写入临时 JSON 文件，通过 `--config <path>` 参数传递给 sidecar：

```json
{
    "scanIntervalSeconds": 0.5,
    "cooldownSeconds": 3,
    "qqOnly": true,
    "teachers": ["张老师", "李老师"]
}
```

### 7.3 事件协议（NDJSON）

| type             | data 字段                          | 说明                    |
| ---------------- | -------------------------------- | --------------------- |
| `Ready`          | `{ts}`                           | sidecar 启动成功，清零崩溃计数   |
| `Notification`   | `{sender, message, appName, rawTexts}` | 收到一条 QQ 通知             |
| `Homework`       | `{sender, content, rawMessage}`  | 旧版兼容，转交渲染层统一处理        |
| `Log`            | `{message}`                      | 日志信息                  |
| `Error` / `AccessDenied` | `{message}`               | 错误事件                  |
| `Stopped`        | -                                | 主动停止                  |

### 7.4 进程管理

| 机制           | 说明                                                          |
| ------------ | ----------------------------------------------------------- |
| 启动           | `spawn(exePath, ['--config', tmpPath], { windowsHide: true })` |
| 停止           | `taskkill /T /F /PID`（连带杀子进程树）                              |
| stdout 解析    | 逐行读取，单条消息上限 1MB，JSON.parse 后交给 `handleSidecarLine`          |
| 崩溃重启         | 异常退出（code≠0）→ 指数退避重启：3s→6s→12s→…→384s                      |
| 连续崩溃保护       | 连续崩溃 8 次停止自动重启，标记 fatal 错误                                  |
| 竞态修复         | `sidecarExpectedPid` 确保只有匹配 pid 的 exit 事件才清引用，防止旧进程 exit 误清新进程 |
| 配置更新         | `qq:updateConfig` → stopSidecar → 300ms 后 startSidecar      |
| 临时配置清理       | 进程退出时删除临时配置文件                                               |

### 7.5 数据流

```
QQ 收到消息 → Windows 通知中心
  → qq-listener.exe 捕获
  → stdout NDJSON {type:"Notification", data:{sender, message}}
  → main/sidecar.js handleSidecarLine()
  → IPC qq:notification 事件
  → 渲染进程 QQPending.handleNotification()
  → HomeworkEngine.extract() 评分
  → 达标 → 入队 pendingCandidates → 学科胶囊红点
  → 用户打开采纳面板 → 保存/合并/忽略
```

---

## 8. 数据模型与存储设计

### 8.1 数据结构

#### 作业对象 `Homework`

```js
{
    id: "hw_1690000000000",      // 主键，格式 hw_<毫秒时间戳>
    subjectId: "chinese",         // 学科 id
    subjectName: "语文",          // 学科名（冗余存储，便于展示）
    content: "1. 完成练习册\n2. 预习课文",  // 作业内容（多行纯文本）
    date: "2026-07-30"            // 作业日期 YYYY-MM-DD
}
```

#### 学科对象 `Subject`

```js
{
    id: "chinese",                // 学科 id（默认学科固定 id，自定义为 subj_<时间戳>）
    name: "语文",                  // 学科名
    color: "#d97a6a"              // 学科色（HEX，ColorPicker 五色系可选）
}
```

#### 老师对象 `Teacher`（QQ 配置）

```js
{
    name: "张老师",               // QQ 昵称
    subjectId: "math",            // 绑定学科 id（null = 未绑定，消息不会被识别）
    subjectName: "数学"            // 学科名（冗余）
}
```

#### 城市对象 `City`（天气设置）

```js
// Open-Meteo 城市（openmeteoCities 数组元素）
{ id: "om_3110034", name: "Imabari", provider: "openmeteo",
  lat: 34.06, lon: 133.02, country: "Japan", admin1: "Ehime", timezone: "auto" }

// 和风天气城市（qweatherCities 数组元素）
{ id: "qw_101010100", name: "北京", provider: "qweather",
  locationId: "101010100", country: "中国", admin1: "北京", timezone: "Asia/Shanghai" }
```

#### 作业候选 `Candidate`（HomeworkEngine 产出）

```js
{
    sender: "张老师",             // 消息发送者
    teacher: "张老师",            // 匹配到的老师名
    subjectId: "math",            // 学科 id
    subjectName: "数学",
    subjectColor: "#6a7ad9",
    content: "做第10页",          // 提取的作业内容
    date: null,                   // 日期由用户手动选择
    score: 70,                    // 评分
    breakdown: {...},             // 评分明细
    rawMessage: "...",            // 原始消息
    timestamp: 1690000000000
}
```

#### 备份文件 `BackupFile`

```js
{
    app: "classworkbench",
    version: 1,
    kind: "settings" | "homeworks" | "snapshot",
    createdAt: "2026-08-05T12:00:00.000Z",
    data: {
        settings: {...},          // kind=settings：按勾选面板裁剪的字段子集
        subjects: [...],          // kind=settings：勾选学科管理时
        homeworks: [...],         // kind=homeworks：按日期范围筛选
        archives: {"2026-04": [...]}  // 含归档备份时
    }
}
```

### 8.2 存储架构

```
userData/                         # Electron 用户数据目录
├── homework-data.enc             # ★ 加密主数据文件（AES-256-GCM 密文，默认）
├── homework-data.json            # 旧版明文（仅加密关闭时使用；首次迁移后改名 .legacy.bak）
├── .cbw-key                      # ★ 加密密钥（DPAPI 加密后落盘，仅当前 Windows 用户可解）
├── archives/                     # 归档目录（按月归档，加密开关开启时为密文）
│   ├── 2026-04.json              # 按月归档文件
│   └── ...
├── restore-snapshots/            # ★ 恢复前自动快照目录
│   └── restore-<时间戳>.json      # kind=snapshot 的备份文件（明文 JSON）
├── bg-cache/                     # 背景图缓存目录
│   ├── index.json                # 缓存索引（current + files 列表）
│   ├── bg-<ts>-<rand>.jpg        # 缓存图片（上限 6 张，单张 20MB）
│   └── ...
└── logs/                         # electron-log 日志
```

**双层存储设计**：

| 层级   | 位置                                    | 内容                 | 写入方式                |
| ---- | ------------------------------------- | ------------------ | ------------------- |
| 活跃数据 | `homework-data.enc`（加密，默认）/ `.json`（明文） | 近 3 个月作业 + 学科 + 设置 | data-store 加密落盘 + 串行队列 |
| 加密密钥 | `.cbw-key` | 32 字节 AES 密钥（DPAPI 加密后落盘） | safeStorage.encryptString 一次性写入 |
| 归档数据 | `archives/YYYY-MM.json`               | 超过 3 个月的作业（加密开关开启时为密文） | atomically 原子写入     |
| 背景缓存 | `bg-cache/`                           | 风景壁纸（上限 6 张）      | 下载→校验→重命名           |
| 恢复快照 | `restore-snapshots/`                  | 每次恢复前的当前数据快照（明文 JSON） | tmp + rename 原子写     |
| 天气缓存 | localStorage（渲染层）                    | 最近一次天气显示数据         | 30 分钟 TTL           |

### 8.3 数据安全机制

| 机制       | 说明                                                  |
| -------- | --------------------------------------------------- |
| **数据加密** | AES-256-GCM 加密主数据文件 `.enc`；密钥经 DPAPI 加密落盘 `.cbw-key`，仅当前 Windows 用户可解（详见 4.10）|
| **完整性校验** | GCM AuthTag 自带认证，密文被篡改/损坏时解密必失败，杜绝静默数据损坏 |
| **密钥隔离** | 密钥仅在主进程内存；渲染层通过 IPC 间接访问数据，永远拿不到密钥 |
| **降级安全** | `safeStorage` 不可用时降级为透传（明文），状态如实暴露给用户，不静默失败 |
| 原子写入     | 归档文件使用 atomically 库（临时文件 + fsync + rename），防止写入中断损坏；备份/快照用 tmp+rename |
| 损坏备份     | 归档文件 JSON 解析失败时，重命名为 `.corrupted.<ts>.bak` 保留，不直接覆盖  |
| 幂等归档     | 基于 `id` 去重，重复归档同一条作业不会产生重复                          |
| 恢复前快照    | 任何恢复操作前先把当前数据写入 `restore-snapshots/`，误恢复可手动回退       |
| 单实例锁     | `requestSingleInstanceLock()` 防止多实例并发写同一数据文件        |
| 串行保存队列   | 渲染层所有保存操作走同一 Promise 链，防止并发覆盖                      |
| 写盘回滚     | `persistHomeworks` 写盘失败时回滚内存状态，保持 UI 与磁盘一致          |
| 参数校验     | 主进程 `validateData()` 校验数据类型和数量上限（10000 条）           |
| 恢复白名单    | 归档写回时月份 key 正则校验（`^\d{4}-\d{2}$`），字段级类型检查           |
| 背图完整性校验  | 缓存图片通过魔数头尾检测（JPEG/PNG/WebP/GIF），损坏图自动删除            |
| **自动迁移** | 旧明文 `.json` 首次启动自动迁移为加密 `.enc`，迁移后旧文件改名 `.legacy.bak` 保留 |

---

## 9. IPC 通信协议

主进程与渲染进程通过 `ipcMain.handle` / `ipcRenderer.invoke` 进行异步通信，共 **32 个请求-响应型 handler**（`main/ipc.js`）。

### 9.1 请求-响应型

| 渲染进程调用                              | IPC 通道              | 主进程 Handler                    | 请求参数                              | 返回值                                   |
| ----------------------------------- | ------------------- | ------------------------------ | --------------------------------- | ------------------------------------- |
| `loadData()`                        | `data:load`         | `archive.loadDataInternal()`   | 无                                 | `{homeworks, subjects, settings}`     |
| `saveData(data)`                    | `data:save`         | 内联（validateData + store.set）  | `{homeworks, subjects, settings}` | `{success}`                           |
| `exportBackup(name, payload)`       | `data:exportBackup` | `backup.exportBackup()`        | `{suggestedName, payload}`        | `{success, filePath?}`                |
| `importBackup()`                    | `data:importBackup` | `backup.importBackup()`        | 无                                 | `{success, data?, filePath?}`         |
| `createRestoreSnapshot(data)`       | `data:createSnapshot` | `backup.createSnapshot()`    | `{settings, subjects, homeworks}` | `{success, filePath}`                 |
| `getArchives()`                     | `data:getArchives`  | `backup.collectArchives()`     | 无                                 | `{'YYYY-MM': [homeworks]}`            |
| `restoreArchives(archives)`         | `data:restoreArchives` | `backup.restoreArchives()`  | `{'YYYY-MM': [...]}`              | `{success, restoredCount, monthCount}` |
| `floatEnter(cards)`                 | `float:enter`       | `floating.enter()`             | `Card[]`                          | `{success, count}`                    |
| `floatExit()`                       | `float:exit`        | `floating.exit()`              | 无                                 | `{success}`                           |
| `floatingAPI.exitAll()`             | `float:exitAll`     | `floating.exit()`              | 无                                 | `{success}`                           |
| `floatingAPI.init()`                | `float:init`        | `floating.getCardForWebContents()` | 无（按 sender.id 识别）           | `{card}` / `null`                     |
| `floatingAPI.ready(height)`         | `float:ready`       | `floating.cardReady()`         | `number`                          | -                                     |
| `floatingAPI.closeWindow()`         | `float:close`       | `floating.closeCard()`         | 无（按 sender.id）                    | `{success}`                           |
| `floatingAPI.closeAfterFade()`      | `float:closeAfterFade` | `floating.closeAfterFade()` | 无（按 sender.id）                    | `{success}`                           |
| `floatingAPI.dock()`                | `float:dock`        | `floating.dockCard()`          | 无（按 sender.id）                    | `{success}`                           |
| `floatingAPI.setHoverMode(en)`      | `float:setHoverMode`| `floating.setHoverMode()`       | `boolean`                         | `{success}`                           |
| `floatingAPI.undock()`              | `float:undock`      | `floating.undockCard()`        | 无（按 sender.id）                    | `{success}`                           |
| `archiveGetMonths()`                | `archive:getMonths` | `archive.getArchiveMonths()`   | 无                                 | `string[]`                            |
| `archiveLoadMonth(key)`             | `archive:loadMonth` | `archive.loadArchiveByMonth()` | `string`                          | `Homework[]`                          |
| `getBackground()`                   | `bg:get`            | `bg.pickCachedBackground()`    | 无                                 | `{ok, url, source}`                   |
| `refreshBackground()`               | `bg:fetch`          | `fetchAndCacheBackground()` → 兜底 `pickRandomCachedBackground()` | 无    | `{ok, url, source, path}`             |
| `getAutoLaunch()`                   | `app:getAutoLaunch` | `autoLaunch.getAutoLaunch()`   | 无                                 | `{success, enabled}`                  |
| `setAutoLaunch(en)`                 | `app:setAutoLaunch` | `autoLaunch.setAutoLaunch()`   | `boolean`                         | `{success}`                           |
| `windowControls.close()`            | `window:close`      | 内联                             | 无                                 | `{success}`                           |
| `copyLayoutImage()`                 | `page:copy`         | `capturePage()` + clipboard    | 无                                 | `{success, copied}` / `{success, error}` |
| `openExternal(url)`                 | `shell:openExternal`| `shell.openExternal(url)`      | `string`                          | Promise                               |
| `qq.toggle(enabled)`                | `qq:toggle`         | `startSidecar/stopSidecar`     | `boolean`                         | `{success}`                           |
| `qq.getStatus()`                    | `qq:getStatus`      | `sidecar.getStatus()`          | 无                                 | `{running, pid, lastError}`           |
| `qq.updateConfig()`                 | `qq:updateConfig`   | `stopSidecar + 300ms 后 startSidecar` | 无                          | `{success}`                           |

### 9.2 事件推送型（主进程 → 渲染进程）

| IPC 通道             | 目标      | 触发时机                 | 数据                                  |
| ----------------- | ------- | -------------------- | ----------------------------------- |
| `qq:ready`        | 主窗口     | sidecar 启动成功         | `{ts}`                              |
| `qq:notification` | 主窗口     | 收到 QQ 通知             | `{sender, message, appName, rawTexts}` |
| `qq:status`       | 主窗口     | sidecar 状态变化（启动/停止）  | `{running, pid, lastError}`          |
| `qq:error`        | 主窗口     | sidecar 错误/连续崩溃放弃    | `{message, fatal?}`                 |
| `float:card-back` | 主窗口     | 浮窗单卡放大回主窗口          | `{id}`                              |
| `float:card-hidden` | 主窗口   | 浮窗单卡关闭（数据保留）        | `{id}`                              |
| `float:exited`    | 主窗口     | 浮窗模式彻底退出（兜底清理完成）    | -                                   |
| `float:probe`     | 对应浮窗    | 贴边：进入探头模式           | `{side: 'left'\|'right', color}`    |
| `float:probe-off` | 对应浮窗    | 滑出：退出探头模式           | -                                   |
| `float:fade-out`  | 对应浮窗    | 退出浮窗模式：播放渐出动画       | -                                   |

> **注意**：`data:load` 时触发归档筛选，`data:save` 时不再触发（直接存储），保证活跃数据始终不含超期作业且保存不卡顿。

---

## 10. 关键业务流程

### 10.1 应用启动流程

```
main.js (主进程编排层)
  app.whenReady()
    → import electron-store + atomically + electron-log
    → 创建 archives 目录
    → 实例化 8 个领域模块（工厂 + 依赖注入）
    → setupIpc()                    # 注册 32 个 IPC handler
    → bg.cleanupBgCache()           # 清理背景图缓存
    → autoLaunch.removeDevAutoLaunchEntry()  # 清理旧开发版自启项
    → windowMod.createWindow()      # 创建无边框主窗口
    → windowMod.createTray()        # 创建系统托盘

index.html 加载
  → CSP 策略限制资源加载
  → 5 个 CSS 按序加载
  → 30 个 JS 按依赖序加载

src/scripts/main.js (渲染进程)
  DOMContentLoaded → init()
    → 依赖检查
    → loadAll()           [IPC: data:load → 主进程归档筛选 → 返回活跃数据]
    → initStyling()
    → renderAll()
    → loadWeather(第一个城市) + setupWeatherRefresh()
    → initBackground() + setupBgRefresh()
    → 时钟定时器 + 事件绑定
    → AppMoreMenu.init()
    → AppDatePicker.init()
    → QQPending.init()    [订阅 qq:notification + 按需自动启动 sidecar]
```

### 10.2 添加作业流程

```
用户点击底栏学科按钮
  → QQPending.handlePillClick(subject, openAdd)
    → 无候选 → AppDialogs.openAddDialog(subject)
    → 有候选 → openAdoptDialog(subject, candidates)
  → showModal(添加表单)
  → 用户输入内容（自动编号：回车续写编号）
  → 点击保存
    → 校验非空
    → 同科同日已有作业 → 追加内容；否则新建
    → persistHomeworks(newHomeworks) [IPC: data:save]
    → Renderer.renderAll()
    → toast('已添加')
    → close()
```

### 10.3 QQ 作业自动捕获流程 ★

```
QQ 收到消息 → Windows 通知中心 → qq-listener.exe 捕获
  → stdout NDJSON {type:"Notification", data:{sender, message}}
  → main/sidecar.js handleSidecarLine()
  → IPC qq:notification 事件
  → QQPending.handleNotification()
  → HomeworkEngine.extract(notification)
    → 老师匹配（私聊 sender / 群聊消息体提取）
    → 学科推断（老师映射，未绑定→放弃）
    → 评分（学科30 + 意图40 + 结构20 + 内容10）
    → score < 40 → 丢弃
  → 去重（sender + rawMessage 哈希）
  → 入队 pendingCandidates（上限 30）
  → saveSettings()
  → toast('收到作业候选：学科名')
  → 学科胶囊红点徽标更新
  → （若采纳面板已打开）实时追加到面板
```

### 10.4 采纳作业流程 ★

```
用户点击带红点的学科胶囊
  → openAdoptDialog(subject, candidates)
  → 展示候选列表（勾选 + 可编辑）+ 已有作业 + 日期胶囊
  → 用户操作：
    ├─ 保存选中：每条独立保存为新作业（同科同日追加）
    ├─ 合并选中（≥2条）：弹出合并编辑框 → 确认后保存为一条
    ├─ 忽略选中：从候选队列删除
    └─ 关闭：不删除候选
  → persistHomeworks() + removePendingByKeys() + saveSettings()
  → Renderer.renderAll() + updatePendingBadge()
```

### 10.5 删除作业流程（二次确认）

```
用户点击卡片 → 卡片激活 → 显示操作按钮
  → 第一次点删除 → actions 加 .confirming 类（5s 后自动退出）
  → 第二次点删除（确认态下）
    → 卡片加 .card-leaving → 播放 cardOut 动画
    → animationend 后：
        → persistHomeworks(过滤掉该作业)
        → renderAll()
        → toast('已删除')
```

### 10.6 自动归档流程

```
触发时机：data:load 时（应用启动），主进程自动执行
  ├─ 计算 cutoff = 当前 - 3 个月（月首）
  ├─ 遍历作业：
  │    日期 >= cutoff → 保留 active
  │    日期 <  cutoff → 按月份分组 toArchive
  ├─ 每个月份：
  │    读取已有归档 → Map<id> 去重合并 → 原子写入
  └─ 返回 active（写回 electron-store）
```

### 10.7 背景图加载流程

```
渲染进程 initBackground()
  → IPC bg:get → 主进程 pickCachedBackground() → 返回缓存图 URL
  → applyBackground(url) → new Image() 解码 → 设置背景
  → IPC bg:fetch → 主进程 fetchAndCacheBackground()
    → downloadBgImage(tmpPath) → net.request 下载 → 超时30s/上限20MB
    → isValidBgImage(tmpPath) → 魔数校验
    → 重命名为 bg-<ts>-<rand>.<ext> → 更新索引 → 驱逐超限旧图
    → 返回 file:// URL
  → applyBackground(newUrl) → 替换背景（保留旧图直到新图加载成功）
```

### 10.8 日期翻页流程

```
用户点击日期按钮 → 展开前后箭头（.date-active 类）
  → 点击 ‹ / › → changeDate(±1)
    → 计算新日期
    → 若 < 3 个月前 → toast 提示去归档查看，阻止翻页
    → 否则 → 更新 currentViewDate → renderAllWithAnimation()
```

### 10.9 浮窗模式流程（画中画）★

```
进入（更多菜单 → 浮窗模式）
  FloatingMode.enter()
    → 收集当日可见卡片 → 卡片渐出动画
    → IPC float:enter(cards)
    → 主进程 floating.enter()
        → forceCleanup()（清旧状态，防竞态）
        → 按内容长度降序排序 → 并行创建 N 个透明置顶窗口（4s 超时）
        → 每个浮窗 init() → 渲染卡片 → 测自然高度 → float:ready(h)
        → 全部就绪（最多等 3.5s）→ layoutAndShow()（右缘竖排，超出加列）
        → 隐藏主窗口
    → 主窗口显示"浮窗模式"横幅

浮窗内操作（floating-window.js ⋯ 菜单）
    ├─ 贴边隐藏  → float:dock → 收缩为探头（26px，整窗在屏内）→ float:probe → 探头模式
    │     鼠标：屏幕边缘热区轮询 → 预展(60px)/缩回；点击探头 → 完全滑出
    │     触屏：点一下预展，再点一下完全滑出
    ├─ 关闭此浮窗 → float:close → float:card-hidden → 记入 hiddenIds（数据保留）
    └─ 退出浮窗  → float:exitAll
退出
  floating.exit()
    → 先显示主窗口 → 各浮窗收 float:fade-out → 播渐出动画 → float:closeAfterFade
    → 700ms 兜底强制清理 → float:exited → 主窗口清空过滤集 → renderAll()
```

### 10.10 备份与恢复流程 ★

```
备份设置（设置 → 数据管理 → 备份与恢复 → 备份设置）
  → 勾选面板模块（常规/天气/个性化/辅助功能/QQ/学科）
  → 组装 payload（按 SETTINGS_SECTIONS 字段映射裁剪）
  → IPC data:exportBackup → 主进程弹保存对话框 → 原子写 JSON

备份作业
  → 选择日期范围（或全部）+ 可选"包含归档"
  → 含归档时 IPC data:getArchives 合并进 payload
  → IPC data:exportBackup 导出

恢复
  → IPC data:importBackup → 主进程弹打开对话框 → 读取解析
  → 【自动快照】IPC data:createSnapshot（当前内存数据 → restore-snapshots/）
  → 覆盖模式：设置按面板应用 → 作业按 id 覆盖 → 归档 IPC data:restoreArchives（按月合并）
  → 合并模式：逐项勾选合并
  → 重启天气/背景定时器 → applyStyling → renderAll
```

---

## 11. 样式架构

样式按依赖顺序分 5 个文件加载，采用 CSS 变量驱动主题。

### 文件职责

| 文件               | 职责                                                    |
| ---------------- | ----------------------------------------------------- |
| `base.css`       | CSS 变量定义（`:root`）、全局重置、自定义滚动条、body 基础样式（含米白点阵纸背景）     |
| `layout.css`     | 背景层（bg-layer/bg-mask）、顶栏胶囊、底栏胶囊、卡片网格布局（瀑布流 + 响应式降列）   |
| `components.css` | 各组件样式：时钟、进度条、天气、预警胶囊、作业卡片（含 blur-card-off 实色追色）、底栏按钮、设置面板、取色器、备份弹窗、模态框、Toast 等 |
| `animations.css` | 全部 `@keyframes` 动画（cardPop/cardOut/fadeIn 等）+ 响应式媒体查询 |
| `floating.css`   | ★ 浮窗专属：窗口定位（透明边距/阴影）、系统级拖拽区域、⋯ 控件与菜单、贴边探头（probe 模式）、渐出动画 |

### 核心 CSS 变量

```css
:root {
    --font-size-content: 26px;           /* 作业正文字号（辅助功能三档 20/26/32） */
    --bg-body: #fafaf7;                  /* 背景底色 */
    --text-primary: #1a1a1a;             /* 主文字色 */
    --glass-bg: rgba(255,255,255,0.45);  /* 玻璃拟态背景 */
    --glass-border: rgba(255,255,255,0.4);
    --accent: #2d3e8e;                   /* 主题强调色 */
    --subject-accent: ...;               /* 学科色（每卡内联设置：圆点/标题/数字圈） */
    --card-tint: rgba(r,g,b,0.30);       /* 学科色整卡追色（每卡内联设置） */
    --transition-spring: cubic-bezier(0.34,1.56,0.64,1);  /* 弹性过渡 */
    --transition-smooth: cubic-bezier(0.4,0,0.2,1);       /* 平滑过渡 */
}
```

### 辅助功能的样式机制

| body class          | 作用                                             |
| ------------------- | ---------------------------------------------- |
| `blur-bars-off`     | 关闭顶栏/底栏/Toast 的 backdrop-filter（实色替代）         |
| `blur-card-off`     | 关闭卡片模糊 → 实色 `--card-tint` 追色（浮窗默认使用此模式）     |
| `blur-modal-off`    | 关闭模态弹窗模糊                                      |
| `reduce-anim`       | 减弱动画：压缩过渡/动画时长（投屏设备性能优化）                     |

### 响应式设计

| 断点        | 行为              |
| --------- | --------------- |
| 默认        | 卡片 2 列（或设置 3 列） |
| `≤ 700px` | 3 列降为 2 列       |
| `≤ 500px` | 降为 1 列          |

### 玻璃拟态实现

顶栏/底栏/弹窗统一使用：

```css
background: var(--glass-bg);
backdrop-filter: blur(16px) saturate(1.2);
border: 1px solid var(--glass-border);
```

### CSP 内容安全策略

`index.html` 中通过 `<meta http-equiv="Content-Security-Policy">` 限制资源加载：

- `default-src 'self'`：默认只允许同源
- `script-src 'self'`：脚本只允许同源（防 XSS）
- `img-src 'self' data: https: file:`：图片允许 https 和本地 file://
- `connect-src`：仅允许 open-meteo、qweatherapi、upx8、xxapi 等域名（含 Geocoding API）。注：和风天请求已改由**主进程 `net.fetch`** 发起（JWT 私钥/签名在 main/），不走渲染 CSP

---

## 12. 依赖关系

### 12.1 模块依赖图（主进程）

```
main.js（编排层）
  ├─ main/constants.js      # 无依赖
  ├─ main/data-cipher.js    # ★ 依赖 safeStorage（DPAPI）/ crypto / fs / path；无业务
  ├─ main/data-store.js     # ★ 依赖 cipher / fs / path；接口兼容 electron-store
  ├─ main/archive.js        # 依赖 store / atomicWrite / cipher / isEncryptionEnabled / fs / path / log
  ├─ main/background-cache.js # 依赖 app / fs / crypto / net / getSettings
  ├─ main/auto-launch.js    # 依赖 app / fs / execFileSync
  ├─ main/backup.js         # 依赖 archive（safeReadArchive / atomicWriteFileSync）/ cipher / isEncryptionEnabled
  ├─ main/sidecar.js        # 无窗口依赖（emit 回调转发事件）
  ├─ main/window.js         # 依赖 BrowserWindow / Tray / Menu
  ├─ main/floating.js       # 依赖 BrowserWindow / screen / getMainWindow / showMainWindow
  └─ main/ipc.js            # 依赖上述全部模块实例（纯胶水）
```

### 12.2 模块依赖图（渲染进程）

```
config.js ──────────────────┐
state.js ───────────────────┤
utils.js ───────────────────┤
                            ▼
storage.js ──────► (依赖 config, state, utils, electronAPI)
styling.js ──────► (依赖 state, utils)
weather.js ──────► (依赖 config, state, utils, modal)
background.js ───► (依赖 state, utils, electronAPI)
layout.js ───────► (独立)
                            ▼
renderer.js ─────► (依赖 state, utils, layout, floating-mode[过滤卡片], dialogs/storage/qq-pending[延迟获取])
modal.js ────────► (依赖 state)
dialogs.js ──────► (依赖 state, utils, modal, storage, renderer)
color-picker.js ─► (独立，被 settings/subjects 使用)
archive-renderer.js ► (依赖 utils, electronAPI)
                            ▼
homework-engine.js ► (依赖 state)  ★独立引擎
qq-pending-dialog.js ► (依赖 state, utils, modal, storage, homework-engine, renderer, electronAPI)
backup.js ───────► (依赖 state, utils, modal, storage, styling, weather, background, renderer, electronAPI)
settings/*.js ───► (general/weather/personal/accessibility/subjects/qq/data 各自依赖 ctx 注入的模块)
settings.js ─────► (组装 ctx：依赖几乎所有模块)
floating-mode.js ► (依赖 state, utils, renderer, electronAPI)
more-menu.js ────► (依赖 utils, electronAPI)
window-controls.js ► (依赖 electronAPI)
datepicker.js ───► (依赖 state, renderer, utils)
                            ▼
main.js (渲染入口) ► (编排上述所有模块)

floating-window.js（浮窗窗口，独立运行）► (依赖 floatingAPI，不依赖主窗口脚本)
```

### 12.3 npm 依赖

| 依赖                 | 版本        | 类型            | 用途                   |
| ------------------ | --------- | ------------- | -------------------- |
| `electron`         | ^33.0.0   | devDependency | 应用框架                 |
| `electron-builder` | ^25.0.0   | devDependency | 打包为 NSIS 安装包         |
| `electron-store`   | ^10.0.0   | dependency    | 数据持久化（ESM，需动态导入）     |
| `atomically`       | ^2.0.3    | dependency    | 原子文件写入（归档文件 + 背图索引）  |
| `electron-log`     | ^5.2.0    | dependency    | 日志记录（主进程异常 + sidecar） |

> 渲染进程不使用任何第三方 JS 库，全部原生实现。

### 12.4 外部服务依赖

| 服务         | URL                                       | 用途       | 必需性          |
| ---------- | ----------------------------------------- | -------- | ------------ |
| Open-Meteo | `api.open-meteo.com/v1/forecast`          | 天气数据     | 非必需（失败降级缓存）  |
| Open-Meteo Geocoding | `geocoding-api.open-meteo.com/v1/search` | 城市搜索    | 非必需          |
| 和风天气       | `*.qweatherapi.com`（用户自配 Host）           | 天气+预警+城市搜索 | 非必需（需用户配置）   |
| Upx8 风景图   | `wp.upx8.com/api.php`                     | 背景图源 1   | 非必需（失败降级缓存）  |
| XXAPI 4K   | `v2.xxapi.cn/api/random4kPic`             | 背景图源 2   | 非必需（失败降级缓存）  |
| qq-listener | 本地 C# 进程                                  | QQ 消息监听  | 非必需（用户按需开启）  |

---

## 13. 构建与运行

### 13.1 环境要求

- Node.js（建议 18+）
- npm
- Windows 系统（构建目标为 NSIS，图标为 .ico）
- .NET 8 SDK（仅编译 sidecar 时需要，已预编译产物在 sidecar/ 下）

### 13.2 开发运行

```bash
# 安装依赖
npm install

# 开发模式启动（直接用 electron 加载当前目录）
npm run dev
# 等价于：electron .
```

或使用快捷脚本：

```bat
test.bat   # 内容为 npm run dev
```

### 13.3 打包构建

```bash
npm run build
# 等价于：electron-builder
```

构建配置（`package.json` 的 `build` 字段）：

```json
{
    "appId": "com.classworkbench.app",
    "productName": "班级工作台",
    "files": ["**/*", "!sidecar/**/*", "!dist/**/*"],
    "win": { "icon": "图标.ico", "target": "nsis" },
    "nsis": { "oneClick": false, "allowToChangeInstallationDirectory": true },
    "extraResources": [{
        "from": "sidecar/qq-listener/.../publish",
        "to": "sidecar",
        "filter": ["qq-listener.exe"]
    }]
}
```

> `extraResources` 将 `qq-listener.exe` 复制到 `resources/sidecar/`，运行时主进程通过 `process.resourcesPath` 定位。

### 13.4 构建产物

```
dist/
├── 班级工作台 Setup 1.0.0.exe          # NSIS 安装包
├── 班级工作台 Setup 1.0.0.exe.blockmap  # 增量更新用 blockmap
└── win-unpacked/                        # 解包版（免安装）
    ├── 班级工作台.exe                    # 可执行文件
    ├── resources/
    │   ├── app.asar                      # 打包后的应用代码（含 main/、floating.html 等）
    │   └── sidecar/
    │       └── qq-listener.exe           # QQ 监听子进程
    └── *.dll, *.pak, locales/...         # Chromium 运行时
```

### 13.5 运行时数据位置

应用运行后，用户数据存储在 Electron 的 `userData` 目录：

| 系统      | 路径                                     |
| ------- | -------------------------------------- |
| Windows | `%APPDATA%/班级工作台/`                     |

目录内容：

```
userData/
├── homework-data.json     # 主数据（electron-store）
├── archives/              # 归档目录
│   ├── 2026-04.json
│   └── ...
├── restore-snapshots/     # 恢复前自动快照
│   └── restore-<ts>.json
├── bg-cache/              # 背景图缓存
│   ├── index.json         # 缓存索引
│   └── bg-*.jpg           # 缓存图片（上限 6 张）
└── logs/                  # electron-log 日志
```

---

## 附录：模块加载顺序

`index.html` 中脚本严格按以下顺序加载（依赖在前，共 30 个）：

```
1.  config.js                    # 常量定义，无依赖
2.  state.js                     # 全局状态，无依赖
3.  utils.js                     # 工具函数，无依赖
4.  storage.js                   # 依赖 config, state, utils, electronAPI
5.  styling.js                   # 依赖 state, utils
6.  weather.js                   # 依赖 config, state, utils, modal  ★多城市
7.  background.js                # 依赖 state, utils, electronAPI
8.  layout.js                    # 独立
9.  renderer.js                  # 依赖 state, utils, layout（dialogs/storage/qq-pending 延迟获取）
10. modal.js                     # 依赖 state
11. dialogs.js                   # 依赖 state, utils, modal, storage, renderer
12. color-picker.js              # 独立（settings/subjects 使用）  ★
13. archive-renderer.js          # 依赖 utils, electronAPI
14. homework-engine.js           # 依赖 state  ★
15. qq-pending-dialog.js         # 依赖 state, utils, modal, storage, homework-engine, renderer  ★
16. settings/general.js          # ┐
17. settings/weather.js          # │
18. settings/personal.js         # │ 设置面板子模块（注册到 window.SettingsModules）
19. settings/accessibility.js    # │
20. settings/subjects.js         # │
21. settings/qq.js               # │
22. settings/data.js             # │
23. settings/nav.js              # ┘  ★
24. backup.js                    # 备份恢复业务  ★
25. settings.js                  # 设置面板入口（组装 ctx）
26. floating-mode.js             # 主窗口侧浮窗控制  ★
27. more-menu.js                 # 依赖 utils, electronAPI  ★
28. window-controls.js           # 依赖 electronAPI  ★
29. datepicker.js                # 依赖 state, renderer, utils
30. main.js                      # 入口，编排启动
```

样式加载顺序：`base.css → layout.css → components.css → animations.css → floating.css`

浮窗窗口（`floating.html`）独立加载：`base.css → components.css → floating.css` + `floating-window.js`（不加载主窗口脚本）。

---

*文档更新时间：2026-08　|　基于源码版本 1.0.0　|　覆盖主进程模块化 / 浮窗模式 / 多城市天气 / 备份恢复 / 辅助功能 / 作业搜索 / 自动更新 / 协议文档同步 / 和风 JWT 认证 / 首启向导 / Emoji 图标系统等全部更新*
