!include "nsDialogs.nsh"
!include "LogicLib.nsh"

; Previous display and internal names, kept only to clean up shortcuts and registry entries.
!define LEGACY_APP_NAME "纸间"
!define LEGACY_EXE_NAME "PaperReader.exe"
!define LEGACY_PROG_ID "PaperReader.pdf"
!define LEGACY_CAPABILITIES "PaperReader"

!ifndef BUILD_UNINSTALLER
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
  ; Remove shortcuts left by older installs that used the previous name.
  Delete "$DESKTOP\${LEGACY_APP_NAME}.lnk"
  Delete "$SMPROGRAMS\${LEGACY_APP_NAME}.lnk"
  Delete "$DESKTOP\${LEGACY_CAPABILITIES}.lnk"
  Delete "$SMPROGRAMS\${LEGACY_CAPABILITIES}.lnk"

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
  Delete "$DESKTOP\${LEGACY_CAPABILITIES}.lnk"
  Delete "$SMPROGRAMS\${LEGACY_CAPABILITIES}.lnk"
!macroend
