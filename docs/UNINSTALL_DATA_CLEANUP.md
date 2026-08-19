# 卸载时删除用户数据 —— 当前情况调研

> 记录日期：2026-08-19
> 需求：安装包通过 NSIS 卸载时，弹窗询问用户是否一并删除「班级工作台」的用户数据。

---

## 一、需求背景

用户希望卸载安装包时，主动询问"是否同时删除用户数据"，选择删除则把作业记录、学科与老师设置、归档数据、天气与 QQ 配置等一起清掉（不可恢复），选择保留则完整保留数据。

---

## 二、已实现的方案

### 1. 自定义卸载脚本

文件：[build/uninstaller.nsh](file:///d:/ClassWorkBench/build/uninstaller.nsh)

利用 electron-builder 的 `nsis.include` 机制，注入 `customUnInit` 宏到系统卸载器的 `un.onInit`（见
[node_modules/app-builder-lib/templates/nsis/uninstaller.nsh](file:///d:/ClassWorkBench/node_modules/app-builder-lib/templates/nsis/uninstaller.nsh#L26-L28)
，卸载会话刚初始化、尚未删除任何文件时执行）。

核心逻辑：

- 静默卸载（`IfSilent`，如自动升级触发的无感卸载）**不弹窗**，直接保留数据。
- 交互式卸载弹 `MB_YESNO`，默认按钮为"否"（`MB_DEFBUTTON2`，防止误删）。
- 选择"是"后，尝试删除多个候选目录：
  - `$APPDATA\${APP_FILENAME}`
  - `$APPDATA\${APP_PRODUCT_FILENAME}`（宏存在时）
  - `$APPDATA\${APP_PACKAGE_NAME}`
  - 全用户安装时先 `SetShellVarContext current`、随后切回 `all`。
- 选择"否"则 `Nop` 什么都不做。
- 删除逻辑全部**内联**，不使用全局变量传值，以规避 NSIS 编译警告 `warning 6001`

  （Variable "_cwbDeleteAppData" not referenced or never set），避免被 `warningsAsErrors` 拦下。

### 2. 打包配置

文件：[package.json](file:///d:/ClassWorkBench/package.json#L25-L29)

```json
"nsis": {
  "oneClick": false,
  "allowToChangeInstallationDirectory": true,
  "include": "uninstaller.nsh"
}
```

`include` 指向项目根目录的 `uninstaller.nsh`（electron-builder 会解析到 `build/uninstaller.nsh`）。

---

## 三、遇到并已解决的问题

| 问题 | 现象 | 处理 |
| --- | --- | --- |
| NSIS 变量未引用警告被当成错误 | 构建报 `ERR_ELECTRON_BUILDER_CANNOT_EXECUTE`，warning 6001 被 `warningsAsErrors` 拦下 | 改用内联逻辑、删除全局变量；问题解决后移除临时加的 `"warningsAsErrors": false` |
| 环境缺 makensis | makensis.exe 无法执行 | 由 electron-builder 自动下载安装 NSIS 工具 |

---

## 四、用户反馈的未解决问题 —— "卸载后数据还是存在"

### 1. 关键事实（文件系统实测）

真实存在两个嫌疑目录：

- `C:\Users\Dell\AppData\Roaming\classworkbench` ← **当前开发版实际使用的 userData**
  - 里面是标准 Electron/Chromium 目录（Cache、GPUCache、Local Storage、Network……）以及加密数据文件、
    归档目录等。
- `C:\Users\Dell\AppData\Local\Temp\cwb-cipher-ICcoTX\userData` ← **历史遗留临时目录**
  - 含 `archives\`、`.cbw-key`、`homework-data.enc.corrupted.*`、`homework-data.json.legacy.bak`。
  - 从内容与命名看，这是早期**加密模块单独调试时**用临时目录当 userData 留下的残留，并非当前应用正在使用的目录。

### 2. Electron 用户目录命名规则（根因所在）

应用对用户目录的定位完全使用 `app.getPath('userData')`（见
[main.js](file:///d:/ClassWorkBench/main.js#L61-L62)、
[main/data-store.js](file:///d:/ClassWorkBench/main/data-store.js#L31-L37)），代码里**没有**任何
`--user-data-dir` 重定向。

但目录名取什么，取决于**运行形态**：

- 开发模式 `electron .` → 名字取自 package.json 的 **name** = `classworkbench`
  → 数据落在 `%APPDATA%\classworkbench`。
- 打包安装版 → Electron 取名自动用 **productName** = `班级工作台`
  → 数据落在 `%APPDATA%\班级工作台`。

也就是说：**卸载脚本删除的 `%APPDATA%\<产品名>` 和开发版实际用的 `%APPDATA%\classworkbench` 是两回事。**

### 3. 初步结论 / 待验证项

- 卸载安装版后，脚本理论上能删掉 `%APPDATA%\班级工作台`（安装版数据），但**删不掉**开发模式一直写入的
  `%APPDATA%\classworkbench`。
- 用户"卸载后仍看到数据"，**更可能是把开发版遗留的 `classworkbench` 目录当成了未删除的数据**，而安装版自身
  的目录可能已删除——这需要一次"安装版卸载"实测确认。
- 尚需实证确认打包后 NSIS 宏 `APP_FILENAME / APP_PRODUCT_FILENAME / APP_PACKAGE_NAME` 三个值分别
  展开成什么，才能断定删除目标与安装版实际 userData 是否一致。

---

## 五、建议的下一步

1. 用一次正式的**安装版 → 卸载（选"是"）**全流程实测：记录卸载前后 `%APPDATA%` 下各目录变化。
2. 确认打包产物中 NSIS 宏展开后的三个目录名（可在 `build` 目录生成的中间 nsi 文件中查看）。
3. 若要把「开发模式遗留的 ~\classworkbench」也纳入清理，需在卸载脚本中**显式补一条**
   `RMDir /r "$APPDATA\classworkbench"`；但这属于开发数据，是否清理由产品语义决定，需与用户确认。

---

## 六、根因定位与修复（2026-08-19）★

### 1. 宏展开值（静态推演 + 源码确认）

electron-builder 在 `NsisTarget.js` 中定义宏：

| 宏 | 展开规则 | 本项目实际值 |
| --- | --- | --- |
| `APP_FILENAME` | `getWindowsInstallationDirName(appInfo, !oneClick)`：productName 能匹配 ASCII 正则 `^[-_+0-9a-zA-Z .]+$` 时用 productName，否则用 `sanitizedName`（= package.json `name` 清洗） | **`classworkbench`**（"班级工作台"是中文，不匹配 ASCII 正则 → 落到 name） |
| `APP_PRODUCT_FILENAME` | 当 `APP_FILENAME !== productFilename` 时定义 | **`班级工作台`** |
| `APP_PACKAGE_NAME` | `name` 的 `/` → `\` | `classworkbench` |

**结论：删除目标 = `%APPDATA%\classworkbench` + `%APPDATA%\班级工作台`，开发版与安装版目录都已覆盖**，
宏配置本身没有问题（与 electron-builder 内置删除逻辑 L219-226 完全一致）。

### 2. 真正的根因 —— 删除时机早于"关闭应用"

electron-builder 模板的卸载时序：

```
un.onInit（L5）:
    initMultiUser ...
    !ifmacrodef customUnInit  ← v1 的询问+删除在这里执行
un.install section（L134）:
    ${IfNot} ${Silent} call un.checkAppRunning   ← 此时才关闭正在运行的应用（taskkill + 等待退出）
    RMDir /r $INSTDIR
    ...
    !ifmacrodef customUnInstall ← 应用已关闭后才执行到这里
```

- 用户通常**不退出应用**直接从控制面板卸载。
- v1 在 `customUnInit`（`un.onInit` 早期）执行 `RMDir /r "$APPDATA\..."`，
  此时应用还在运行，Electron 的 LevelDB/SQLite/Cache 文件被占用 → `RMDir /r` **静默失败**（NSIS 不报错）。
- 随后 `un.install` 段才 `taskkill` 应用 → 卸载完成，但 userData 已经删不掉了 → "卸载后数据还是存在"。

### 3. 修复（v2 重构 `build/uninstaller.nsh`）

- **询问**留在 `customUnInit`：弹窗后仅把选择记入全局变量 `$CWB_DELETE_APP_DATA`（"1"/"0"），不删除。
- **删除**移到 `customUnInstall`（`un.install` section 末尾）：此时 `un.checkAppRunning` 已关闭应用、
  文件锁已释放，再按 `$CWB_DELETE_APP_DATA == "1"` 执行 `RMDir /r` 三个候选目录。
- 静默卸载（自动升级）仍直接保留数据；交互式卸载默认按钮为"否"（`MB_DEFBUTTON2`）。

### 5. 构建失败根因与最终修复（v3，已实测通过）★

实际构建发现两个更隐蔽的坑，两者共同导致 NSIS 编译失败（`warning 6001 … treated as error`）：
最终文件重命名为 `build/cwb-uninstaller.nsh`（避免与模板同名冲突），且变量声明
用 `!ifdef BUILD_UNINSTALLER` 包裹。

1. **文件同名冲突（顶替卸载器模板）**：electron-builder 会把 `build` 目录加进 NSIS include 搜索路径
   （`!addincludedir "…\build"`），卸载器模板用相对名 `!include "uninstaller.nsh"`。若我们提供同名文件，
   NSIS 会解析到我们自己的文件 → **electron-builder 卸载器模板被顶替**，`un.onInit`/`un.install` 都没有
   自定义宏的挂载点，宏永不展开。→ **改名 `cwb-uninstaller.nsh`**。
2. **变量在安装器编译中被判"未引用"**：electron-builder 编译两次脚本——安装器编译（无 `BUILD_UNINSTALLER`）
   与卸载器编译（有）。`customUnInit`/`customUnInstall` 只在卸载器编译展开；若 `Var /GLOBAL CWB_DELETE_APP_DATA`
   在两次编译都声明，安装器编译里它从未被引用 → `warning 6001` → `-WX` 变错误 → 构建失败。
   → **`Var /GLOBAL` 用 `!ifdef BUILD_UNINSTALLER` 包裹**，只在卸载器编译声明。

已用 `npx electron-builder --win nsis` 实测：**构建成功**，`班级工作台 Setup 1.0.0.exe` 正常产出。

### 6. 尚需实测确认

- 安装版 → 卸载（选"是"）→ `%APPDATA%\班级工作台` 与 `%APPDATA%\classworkbench` 均被删除
  （**应用已关闭** 与 **应用运行中** 各测一次，后者应能由 `un.checkAppRunning` taskkill 兜底）。
- 卸载（选"否"）→ 两个目录完整保留。