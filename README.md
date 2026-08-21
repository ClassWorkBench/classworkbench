# 班级工作台 ClassWorkBench

面向班级教学场景的 Windows 桌面应用：作业管理、学科系统、天气预警、QQ 通知捕获、画中画浮窗，一块大屏管好晚修。

**本地优先 · 无账号 · MIT 开源**

## 功能

| 模块 | 说明 |
|---|---|
| 作业管理 | 录入/编辑/归档/恢复作业，按截止时间排序，晚修进度一目了然 |
| 学科系统 | 8 学科预设配色，自定义名称/颜色/图标 |
| 天气预警 | 多城市搜索管理，双数据源（和风天气 + Open-Meteo），四级预警（蓝/黄/橙/红） |
| QQ 捕获 | C# Sidecar 监听系统通知，智能匹配教师名单，一键采纳作业候选 |
| 画中画浮窗 | 作业卡片独立置顶窗口，贴边探头交互，不打断其他操作 |
| 备份恢复 | 手动导出 + 自动快照 + 一键恢复，恢复前自动生成快照兜底 |
| 数据加密 | AES-256-GCM 透明加密，密钥由 Windows 凭据保护（DPAPI），用户可选 |
| 个性化 | 5 套配色方案、取色器、背景图源、布局调整 |
| 辅助功能 | 三档字号、减弱动画、三路模糊（顶栏/卡片/弹窗） |

## 技术栈

- **Electron 33**（主进程模块化：`main/` 11 个领域模块 + IPC 胶水层，渲染进程原生 JS/CSS）
- **C# .NET 8 NativeAOT** Sidecar（`sidecar/qq-listener`，单文件 exe，无需 .NET 运行时）
- **数据加密**：AES-256-GCM + Windows DPAPI（`main/data-cipher.js`）
- **图标**：IconPark（Apache-2.0）+ Fluent UI Emoji（MIT）

## 命名约定

| 场合 | 写法 | 示例 |
|---|---|---|
| 包名 / 仓库 / appId / 目录 | `classworkbench`（全小写） | `com.classworkbench.app` |
| 产品名 / 主程序 / 安装包 | `ClassWorkBench`（PascalCase） | `ClassWorkBench.exe`、`classworkbench-setup-1.0.3.exe` |
| 界面显示 / 中文品牌 | 班级工作台 | 窗口标题、托盘、向导 |

## 构建

### 环境要求

- Node.js 20+
- .NET 8 SDK（仅构建 sidecar 时需要）
- Windows 10 19041+（QQ 捕获依赖系统通知 API）

### 开发运行

```bash
npm install
npm run dev
```

### 打包安装程序

```bash
# 1. 构建 sidecar（NativeAOT，首次 5-15 分钟）
cd sidecar/qq-listener
dotnet publish -c Release -r win-x64

# 2. 打包 NSIS 安装包
cd ../..
npm run build
```

产物位于 `dist/`，卸载时会询问是否删除用户数据（`build/cwb-uninstaller.nsh`）。

## 数据与隐私

- **本地优先**：作业、学科、设置全部存储在本机 `%APPDATA%`，无账号、无云同步、无遥测
- **加密存储**：数据文件经 AES-256-GCM 加密，密钥由 Windows 凭据保护
- **QQ 通知**：通知文本仅在本机内存处理，不落盘、不上传，可随时关闭
- **第三方服务**：天气（和风/Open-Meteo）与背景图（Upx8/XXAPI）为功能必需的最小请求；另启动时后台下载最新协议文档，均为单向获取，不上传本地数据

详见 [隐私声明](PRIVACY.md)、[数据的安全性](SECURITY.md)。

## 开源许可

本软件以 **MIT License** 开源，详见 [LICENSE](LICENSE)。

- [用户协议](AGREEMENT.md)
- [隐私声明](PRIVACY.md)
- [数据的安全性](SECURITY.md)
- [开源软件声明](OPENSOURCE.md)
- [第三方许可](THIRD-PARTY-LICENSES)
- [联系我们](CONTACT.md)

## 致谢

- 界面图标：[IconPark](https://github.com/bytedance/IconPark)（字节跳动，Apache-2.0）
- 彩色 Emoji：[Fluent UI Emoji](https://github.com/microsoft/fluentui-emoji)（微软，MIT）
- 天气数据：[和风天气](https://www.qweather.com) / [Open-Meteo](https://open-meteo.com)
