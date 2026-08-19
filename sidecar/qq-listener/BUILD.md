# qq-listener sidecar 构建说明

ClassWorkBench 的 C# sidecar，监听 QQ Toast 并抽取作业候选。

## 依赖

- **.NET 8 SDK**（不是 Runtime，必须是 SDK）
  - 下载：https://dotnet.microsoft.com/download/dotnet/8.0
  - 选 "SDK x64 Windows" 安装包（约 200MB）
  - 装完 `dotnet --list-sdks` 应能看到 8.0.x
- **Windows 10 SDK 10.0.19041.0+**（通常随 Visual Studio 或独立 Windows SDK 安装）
  - 若未安装，编译会报 "TargetFramework net8.0-windows10.0.19041.0 not found"
  - 下载：https://developer.microsoft.com/windows/downloads/windows-sdk/

## 构建

### 调试构建（普通，需要 .NET 运行时）

```powershell
cd d:\ClassWorkBench\sidecar\qq-listener
dotnet build -c Release
```

输出在 `bin\Release\net8.0-windows10.0.19041.0\qq-listener.exe`。

### AOT 发布（推荐，单文件 ~8MB，用户无需 .NET 运行时）

```powershell
cd d:\ClassWorkBench\sidecar\qq-listener
dotnet publish -c Release -r win-x64
```

输出目录：
`bin\Release\net8.0-windows10.0.19041.0\win-x64\publish\qq-listener.exe`

> ⚠️ NativeAOT 首次编译较慢（5-15 分钟），后续增量编译会快很多。
>
> ⚠️ AOT 需要 **C++ 工作负载**（Desktop development with C++），通常随 Visual Studio Build Tools 一起安装。若报错 "error MSB3677: Unable to find vcvarsall.bat"，请装：
> https://visualstudio.microsoft.com/visual-cpp-build-tools/
> 勾选 "使用 C++ 的桌面开发"。

## 手动测试

### 1. 命令行直接运行（不传配置）

```powershell
.\qq-listener.exe
```

期望输出：
```
{"type":"Log","ts":1234567890,"data":{"level":"info","message":"qq-listener 启动"}}
{"type":"Ready","ts":1234567891,"data":null}
```

随后保持运行，等待 QQ 消息。第一次运行会弹出 Windows 通知权限请求，必须允许。

### 2. 通过 stdin 传配置

```powershell
'{"teachers":["张老师"],"subjects":["语文","数学"]}' | .\qq-listener.exe
```

### 3. 通过 --config 传配置

```powershell
.\qq-listener.exe --config config.json
```

`config.json` 示例：
```json
{
  "scanIntervalSeconds": 0.5,
  "cooldownSeconds": 3,
  "qqOnly": true,
  "teachers": ["张老师", "李老师"],
  "importantKeywords": ["作业", "完成", "练习"],
  "subjects": ["语文", "数学", "英语", "物理", "化学"],
  "enableHomeworkExtraction": true
}
```

### 4. 发一条 QQ 群消息测试

在 QQ 群里发 "语文：完成第 12 页练习"，期望输出：

```
{"type":"Notification","ts":...,"data":{"sender":"张老师","message":"语文：完成第 12 页练习","appName":"QQ","important":true,"rawTexts":["张老师","语文：完成第 12 页练习"]}}
{"type":"Homework","ts":...,"data":{"sender":"张老师","subject":"语文","content":"完成第 12 页练习","date":null,"confidence":0.8,"important":true,"rawMessage":"语文：完成第 12 页练习"}}
```

按 Ctrl+C 退出。

## stdout 协议（NDJSON）

每行一个 JSON 对象，`type` 字段区分：

| type | data | 含义 |
|------|------|------|
| `Ready` | null | 监听已启动 |
| `Notification` | `NotificationData` | 原始 QQ 消息 |
| `Homework` | `HomeworkCandidate` | 抽取的作业候选 |
| `Log` | `LogData` | 日志 |
| `Error` | `ErrorData` | 错误 |
| `AccessDenied` | `ErrorData` | 通知权限未授予 |
| `Stopped` | null | 主动停止 |

Electron 主进程 spawn 后逐行解析 JSON 即可。

## 文件清单

```
qq-listener/
├── qq-listener.csproj      # 项目配置（AOT、TargetFramework）
├── Program.cs              # 入口：配置加载、Ctrl+C、主循环
├── Models.cs               # 数据模型：SidecarConfig / OutputEvent / NotificationData / HomeworkCandidate
├── NotificationMonitor.cs  # WinRT 监听 UserNotificationListener
├── MessageProcessor.cs     # 去重/冷却/黑白名单/重要判定
└── HomeworkExtractor.cs    # 学科匹配/内容/日期/置信度
```

## 故障排查

### 编译错误

| 错误 | 解决 |
|------|------|
| `TargetFramework net8.0-windows10.0.19041.0 not found` | 装 .NET 8 SDK |
| `error MSB3677: Unable to find vcvarsall.bat` | 装 Visual Studio Build Tools（C++ 工作负载） |
| `error NETSDKxxx: ... Windows.SDK` | TargetFramework 已自带 WinRT 投影，无需额外 NuGet 包 |

### 运行时错误

| 输出 | 解决 |
|------|------|
| `AccessDenied: 通知访问权限未授予` | Windows 设置 → 通知 → 允许桌面应用读取通知 |
| 无任何 Notification 输出 | 确认 NT QQ 已开启系统通知；确认 QQ_Only=true 时发消息的应用名是 "QQ" |
| `无法获取 UserNotificationListener` | 系统太旧，需 Win10 1903+ |

## 后续整合到 Electron

构建出 `qq-listener.exe` 后，复制到：

```
d:\ClassWorkBench\resources\sidecar\qq-listener.exe
```

并在 [package.json](file:///d:/ClassWorkBench/package.json) 的 `build.extraResources` 加入：

```json
"build": {
  "extraResources": [
    { "from": "resources/sidecar", "to": "sidecar" }
  ]
}
```

这样打包后可通过 `process.resourcesPath` 拿到 sidecar 路径。
