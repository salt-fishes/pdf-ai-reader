!include "nsDialogs.nsh"
!include "LogicLib.nsh"

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

  ${NSD_CreateCheckbox} 0 0 100% 18u "在 PDF 的“打开方式”中显示纸间（推荐）"
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
  ${If} $PdfAssocState == ${BST_CHECKED}
    WriteRegNone SHELL_CONTEXT "Software\Classes\.pdf\OpenWithProgids" "PaperReader.pdf"

    WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\PaperReader.exe" "" "纸间"
    WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\PaperReader.exe\FriendlyAppName" "" "纸间"
    WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\PaperReader.exe\DefaultIcon" "" "$INSTDIR\PaperReader.exe,0"
    WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\PaperReader.exe\shell\open\command" "" '"$INSTDIR\PaperReader.exe" "%1"'
    WriteRegNone SHELL_CONTEXT "Software\Classes\Applications\PaperReader.exe\SupportedTypes" ".pdf"

    WriteRegStr SHELL_CONTEXT "Software\Classes\PaperReader.pdf" "" "PDF 文档"
    WriteRegStr SHELL_CONTEXT "Software\Classes\PaperReader.pdf\DefaultIcon" "" "$INSTDIR\PaperReader.exe,0"
    WriteRegStr SHELL_CONTEXT "Software\Classes\PaperReader.pdf\shell\open\command" "" '"$INSTDIR\PaperReader.exe" "%1"'

    WriteRegStr SHELL_CONTEXT "Software\RegisteredApplications" "纸间" "Software\PaperReader\Capabilities"
    WriteRegStr SHELL_CONTEXT "Software\PaperReader\Capabilities" "ApplicationName" "纸间"
    WriteRegStr SHELL_CONTEXT "Software\PaperReader\Capabilities" "ApplicationDescription" "本地优先的 PDF 阅读器与 AI 阅读助手"
    WriteRegStr SHELL_CONTEXT "Software\PaperReader\Capabilities" "ApplicationIcon" "$INSTDIR\PaperReader.exe,0"
    WriteRegStr SHELL_CONTEXT "Software\PaperReader\Capabilities\FileAssociations" ".pdf" "PaperReader.pdf"
  ${EndIf}

  ${If} $PdfSettingsState == ${BST_CHECKED}
    ExecShell "open" "ms-settings:defaultapps"
  ${EndIf}
!macroend

!macro customUnInstall
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.pdf\OpenWithProgids" "PaperReader.pdf"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\Applications\PaperReader.exe"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\PaperReader.pdf"
  DeleteRegKey SHELL_CONTEXT "Software\PaperReader"
  DeleteRegValue SHELL_CONTEXT "Software\RegisteredApplications" "纸间"
!macroend
