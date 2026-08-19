; ============================================================
;  班级工作台 · 卸载询问是否删除用户数据
;  通过 electron-builder 的 nsis.include 注入到 NSIS 卸载器
; ------------------------------------------------------------
;  ⚠️ 本文件不能命名为 uninstaller.nsh / installer.nsh：
;     electron-builder 会把 build 目录加进 NSIS include 搜索路径
;     （!addincludedir），模板卸载器用相对名 !include "uninstaller.nsh"，
;     同名文件会被解析到本文件，导致 electron-builder 卸载器模板被
;     顶替、宏永不展开（warning 6001 + 卸载器功能缺失）。
; ------------------------------------------------------------
;  修订记录（2026-08-19）：
;   v1 把"询问 + 删除"都放在 customUnInit（un.onInit）：
;      卸载时应用往往还在运行 → userData 文件被锁 → RMDir /r 静默失败
;      → "卸载后数据还是存在"。
;   v2（本版）：
;    - customUnInit（un.onInit，卸载会话初始化时）：
;        弹窗询问用户数据去留，仅把选择记到 $CWB_DELETE_APP_DATA，不立即删除。
;    - customUnInstall（un.install section 末尾）：
;        此时 un.install 段已调用 un.checkAppRunning 关闭正在运行的应用
;        （文件锁已释放），再按用户选择删除 userData。
;   v3：Var /GLOBAL 用 !ifdef BUILD_UNINSTALLER 包裹——
;       customUnInit/customUnInstall 只在卸载器编译（BUILD_UNINSTALLER）
;       中展开，若变量在安装器编译中也声明，会因"从未引用"触发
;       warning 6001 并被 -WX 当作错误（构建失败）。
; ============================================================

; 跨宏传递用户选择（customUnInit 设置 / customUnInstall 读取）。
; 仅在卸载器编译中声明：安装器编译中宏不展开，声明了反而 6001。
!ifdef BUILD_UNINSTALLER
  Var /GLOBAL CWB_DELETE_APP_DATA
!endif

!macro customUnInit
  ; 静默卸载（如自动升级触发的卸载）不打扰用户，直接保留数据
  IfSilent cbw_un_ask_done 0

  MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "是否同时删除「班级工作台」在本机的用户数据？$\r$\n$\r$\n这会清除：作业记录、学科与老师设置、归档数据、天气与 QQ 配置等，且无法恢复。$\r$\n$\r$\n选择「否」可完整保留数据。" IDYES cbw_un_ask_delete IDNO cbw_un_ask_keep
  Goto cbw_un_ask_done

  cbw_un_ask_delete:
    StrCpy $CWB_DELETE_APP_DATA "1"
    Goto cbw_un_ask_done

  cbw_un_ask_keep:
    StrCpy $CWB_DELETE_APP_DATA "0"

  cbw_un_ask_done:
!macroend

!macro customUnInstall
  ${If} $CWB_DELETE_APP_DATA == "1"
    ; Electron 用户数据默认放 %APPDATA%\<应用名>，打包后取 productName / name 两种可能，
    ; 与 electron-builder 自带的 app-data 删除逻辑保持一致，三者都尝试清除。
    ${If} $installMode == "all"
      SetShellVarContext current
    ${EndIf}

    RMDir /r "$APPDATA\${APP_FILENAME}"
    !ifdef APP_PRODUCT_FILENAME
      RMDir /r "$APPDATA\${APP_PRODUCT_FILENAME}"
    !endif
    ; Electron 会用 package.json 的 name 作为缓存 / indexdb 等目录
    !ifdef APP_PACKAGE_NAME
      RMDir /r "$APPDATA\${APP_PACKAGE_NAME}"
    !endif

    ${If} $installMode == "all"
      SetShellVarContext all
    ${EndIf}
  ${EndIf}
!macroend
