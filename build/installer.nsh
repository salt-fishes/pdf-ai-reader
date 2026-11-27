!include "nsDialogs.nsh"
!include "LogicLib.nsh"

!ifndef BUILD_UNINSTALLER
  !include "getProcessInfo.nsh"
!endif

; Previous display and internal names, kept only to clean up shortcuts and registry entries.
!define LEGACY_APP_NAME "纸间"
!define LEGACY_EXE_NAME "PaperReader.exe"
!define LEGACY_PROG_ID "PaperReader.pdf"
!define LEGACY_CAPABILITIES "PaperReader"

!ifndef BUILD_UNINSTALLER
Var LegacyMsiKey
Var LegacyMsiIndex
Var LegacyMsiDisplayName
Var LegacyMsiInstaller
Var LegacyMsiResult
Var LegacyMsiAttempt
Var pid

; Run after the app has been closed, but before electron-builder removes an old
; NSIS install or extracts the new files. This prevents an old MSI from deleting
; the newly installed files during a later customInstall hook.
!macro customCheckAppRunning
  !insertmacro IS_POWERSHELL_AVAILABLE
  !insertmacro _CHECK_APP_RUNNING
  Call RemoveLegacyMsiInstalls
!macroend

!macro RemoveLegacyMsiRoot ROOT
  StrCpy $LegacyMsiIndex 0

FindLegacyMsi_${ROOT}:
  EnumRegKey $LegacyMsiKey ${ROOT} "Software\Microsoft\Windows\CurrentVersion\Uninstall" $LegacyMsiIndex
  StrCmp $LegacyMsiKey "" DoneLegacyMsi_${ROOT}

  ; The msiWrapped product only launches this installer and is not registered as
  ; an installed app. Keep this guard in case a future WiX version does register it.
  StrCmp $LegacyMsiKey "{4AD099FF-9EA2-5A2E-B9B1-9DF38E2D1FCB}" NextLegacyMsi_${ROOT}

  StrCpy $LegacyMsiDisplayName ""
  StrCpy $LegacyMsiInstaller 0
  ReadRegStr $LegacyMsiDisplayName ${ROOT} "Software\Microsoft\Windows\CurrentVersion\Uninstall\$LegacyMsiKey" DisplayName
  ReadRegDWORD $LegacyMsiInstaller ${ROOT} "Software\Microsoft\Windows\CurrentVersion\Uninstall\$LegacyMsiKey" WindowsInstaller

  ${If} $LegacyMsiDisplayName == "${PRODUCT_NAME}"
  ${AndIf} $LegacyMsiInstaller == 1
    DetailPrint "Removing previous Wenshu MSI installation..."
    StrCpy $LegacyMsiAttempt 0

RetryLegacyMsi_${ROOT}:
    IntOp $LegacyMsiAttempt $LegacyMsiAttempt + 1
    ExecWait '"$SYSDIR\msiexec.exe" /x "$LegacyMsiKey" /qn /norestart' $LegacyMsiResult
    ${If} $LegacyMsiResult == 0
    ${OrIf} $LegacyMsiResult == 3010
      Goto NextLegacyMsi_${ROOT}
    ${EndIf}

    ${If} $LegacyMsiAttempt < 3
      Sleep 1000
      Goto RetryLegacyMsi_${ROOT}
    ${EndIf}

    MessageBox MB_ICONSTOP|MB_TOPMOST "无法卸载旧版文疏（错误码 $LegacyMsiResult）。安装已取消，请关闭文疏后重试。"
    SetErrorLevel 1
    Quit
  ${EndIf}

NextLegacyMsi_${ROOT}:
  IntOp $LegacyMsiIndex $LegacyMsiIndex + 1
  Goto FindLegacyMsi_${ROOT}

DoneLegacyMsi_${ROOT}:
!macroend

Function RemoveLegacyMsiInstalls
  !insertmacro RemoveLegacyMsiRoot HKCU
  !insertmacro RemoveLegacyMsiRoot HKLM
FunctionEnd

Var PdfAssocCheckbox
Var PdfAssocState
Var PdfSettingsCheckbox
Var PdfSettingsState
!macro customPageAfterChangeDir
  Page custom PdfAssocPageCreate PdfAssocPageLeave
!macroend

Function PdfAssocPageCreate
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateCheckbox} 0 0 100% 18u "在 PDF 的“打开方式”中显示文疏（推荐）"
  Pop $PdfAssocCheckbox
  ${NSD_SetState} $PdfAssocCheckbox ${BST_CHECKED}

  ${NSD_CreateCheckbox} 0 26u 100% 18u "安装完成后打开 Windows 默认应用设置"
  Pop $PdfSettingsCheckbox
  ${NSD_SetState} $PdfSettingsCheckbox ${BST_UNCHECKED}

  ${NSD_CreateLabel} 0 52u 100% 44u "Windows 不允许安装程序静默修改默认应用。勾选第二项只会打开系统设置；最终是否设为默认由你在系统里确认。"
  Pop $0

  nsDialogs::Show
FunctionEnd

Function PdfAssocPageLeave
  ${NSD_GetState} $PdfAssocCheckbox $PdfAssocState
  ${NSD_GetState} $PdfSettingsCheckbox $PdfSettingsState
FunctionEnd
!endif

!macro customInstall
  ; Use a fresh Windows taskbar identity instead of reusing the legacy app id,
  ; which can keep the old name/icon cached on existing installations.
  ${If} ${FileExists} "$newStartMenuLink"
    WinShell::SetLnkAUMI "$newStartMenuLink" "cn.paperreader.app.wenshu"
  ${EndIf}
  ${If} ${FileExists} "$newDesktopLink"
    WinShell::SetLnkAUMI "$newDesktopLink" "cn.paperreader.app.wenshu"
  ${EndIf}

  ; Remove shortcuts left by older installs that used the previous name.
  Delete "$DESKTOP\${LEGACY_APP_NAME}.lnk"
  Delete "$SMPROGRAMS\${LEGACY_APP_NAME}.lnk"
  Delete "$STARTMENU\${LEGACY_APP_NAME}.lnk"
  Delete "$SMPROGRAMS\..\${LEGACY_APP_NAME}.lnk"
  Delete "$DESKTOP\${LEGACY_CAPABILITIES}.lnk"
  Delete "$SMPROGRAMS\${LEGACY_CAPABILITIES}.lnk"
  Delete "$STARTMENU\${LEGACY_CAPABILITIES}.lnk"
  Delete "$SMPROGRAMS\..\${LEGACY_CAPABILITIES}.lnk"

  ${If} $PdfAssocState == ${BST_CHECKED}
    ; Remove the pre-0.10.2 PaperReader registration before writing Wenshu.
    DeleteRegValue SHELL_CONTEXT "Software\Classes\.pdf\OpenWithProgids" "${LEGACY_PROG_ID}"
    DeleteRegKey SHELL_CONTEXT "Software\Classes\Applications\${LEGACY_EXE_NAME}"
    DeleteRegKey SHELL_CONTEXT "Software\Classes\${LEGACY_PROG_ID}"
    DeleteRegKey SHELL_CONTEXT "Software\${LEGACY_CAPABILITIES}"
    DeleteRegValue SHELL_CONTEXT "Software\RegisteredApplications" "${LEGACY_CAPABILITIES}"
    DeleteRegValue SHELL_CONTEXT "Software\RegisteredApplications" "${LEGACY_APP_NAME}"

    WriteRegNone SHELL_CONTEXT "Software\Classes\.pdf\OpenWithProgids" "Wenshu.pdf"

    WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\Wenshu.exe" "" "文疏"
    WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\Wenshu.exe\FriendlyAppName" "" "文疏"
    WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\Wenshu.exe\DefaultIcon" "" "$INSTDIR\Wenshu.exe,0"
    WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\Wenshu.exe\shell\open\command" "" '"$INSTDIR\Wenshu.exe" "%1"'
    WriteRegNone SHELL_CONTEXT "Software\Classes\Applications\Wenshu.exe\SupportedTypes" ".pdf"

    WriteRegStr SHELL_CONTEXT "Software\Classes\Wenshu.pdf" "" "PDF 文档"
    ${If} ${FileExists} "$INSTDIR\pdf-file.ico"
      WriteRegStr SHELL_CONTEXT "Software\Classes\Wenshu.pdf\DefaultIcon" "" "$INSTDIR\pdf-file.ico,0"
    ${Else}
      WriteRegStr SHELL_CONTEXT "Software\Classes\Wenshu.pdf\DefaultIcon" "" "$INSTDIR\Wenshu.exe,0"
    ${EndIf}
    WriteRegStr SHELL_CONTEXT "Software\Classes\Wenshu.pdf\shell\open\command" "" '"$INSTDIR\Wenshu.exe" "%1"'

    WriteRegStr SHELL_CONTEXT "Software\RegisteredApplications" "文疏" "Software\Wenshu\Capabilities"
    WriteRegStr SHELL_CONTEXT "Software\Wenshu\Capabilities" "ApplicationName" "文疏"
    WriteRegStr SHELL_CONTEXT "Software\Wenshu\Capabilities" "ApplicationDescription" "文疏 · 本地优先的 PDF 阅读器与 AI 阅读助手"
    WriteRegStr SHELL_CONTEXT "Software\Wenshu\Capabilities" "ApplicationIcon" "$INSTDIR\Wenshu.exe,0"
    WriteRegStr SHELL_CONTEXT "Software\Wenshu\Capabilities\FileAssociations" ".pdf" "Wenshu.pdf"
  ${EndIf}

  ${If} $PdfSettingsState == ${BST_CHECKED}
    ExecShell "open" "ms-settings:defaultapps"
  ${EndIf}
!macroend

!macro customUnInstall
  WinShell::UninstAppUserModelId "cn.paperreader.app.wenshu"

  DeleteRegValue SHELL_CONTEXT "Software\Classes\.pdf\OpenWithProgids" "Wenshu.pdf"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\Applications\Wenshu.exe"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\Wenshu.pdf"
  DeleteRegKey SHELL_CONTEXT "Software\Wenshu"
  DeleteRegValue SHELL_CONTEXT "Software\RegisteredApplications" "文疏"

  DeleteRegValue SHELL_CONTEXT "Software\Classes\.pdf\OpenWithProgids" "${LEGACY_PROG_ID}"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\Applications\${LEGACY_EXE_NAME}"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\${LEGACY_PROG_ID}"
  DeleteRegKey SHELL_CONTEXT "Software\${LEGACY_CAPABILITIES}"
  DeleteRegValue SHELL_CONTEXT "Software\RegisteredApplications" "${LEGACY_CAPABILITIES}"
  DeleteRegValue SHELL_CONTEXT "Software\RegisteredApplications" "${LEGACY_APP_NAME}"

  Delete "$DESKTOP\${LEGACY_APP_NAME}.lnk"
  Delete "$SMPROGRAMS\${LEGACY_APP_NAME}.lnk"
  Delete "$STARTMENU\${LEGACY_APP_NAME}.lnk"
  Delete "$SMPROGRAMS\..\${LEGACY_APP_NAME}.lnk"
  Delete "$DESKTOP\${LEGACY_CAPABILITIES}.lnk"
  Delete "$SMPROGRAMS\${LEGACY_CAPABILITIES}.lnk"
  Delete "$STARTMENU\${LEGACY_CAPABILITIES}.lnk"
  Delete "$SMPROGRAMS\..\${LEGACY_CAPABILITIES}.lnk"
!macroend
