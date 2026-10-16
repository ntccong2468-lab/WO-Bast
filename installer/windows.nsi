Unicode true
!include "MUI2.nsh"
!include "x64.nsh"
!include "StrFunc.nsh"
${Using:StrFunc} StrStr
!ifndef APP_DIR
!error "Pass /DAPP_DIR (Windows) or -DAPP_DIR (Linux)"
!endif
!ifndef OUTPUT
!error "Pass OUTPUT"
!endif
!ifndef VERSION
!define VERSION "0.2.0"
!endif
Name "VN ПОЧТА"
OutFile "${OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\VN-Pochta"
RequestExecutionLevel user
SetCompressor zlib
VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "VN ПОЧТА"
VIAddVersionKey "FileDescription" "VN ПОЧТА Windows installer"
VIAddVersionKey "FileVersion" "${VERSION}"
!define MUI_ABORTWARNING
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\VN-Pochta.exe"
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Vietnamese"
Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "Windows 64-bit required."
    Abort
  ${EndIf}
FunctionEnd
Function CheckRunning
  StrCpy $1 0
  wait_for_app:
  FindWindow $0 "Chrome_WidgetWin_1" "VN ПОЧТА"
  nsExec::ExecToStack '/TIMEOUT=5000 "$SYSDIR\tasklist.exe" /FI "IMAGENAME eq VN-Pochta.exe" /NH /FO CSV'
  Pop $5
  Pop $6
  ${StrStr} $7 $5 "VN-Pochta.exe"
  ${If} $7 == ""
    ${StrStr} $7 $6 "VN-Pochta.exe"
  ${EndIf}
  ${If} $0 == 0
    ${If} $7 == ""
      Return
    ${EndIf}
  ${EndIf}
  ${If} $0 == 0
    StrCpy $0 1
  ${EndIf}
  ${If} $0 == 0
    Return
  ${EndIf}
  ${If} $1 >= 40
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Hãy đóng VN ПОЧТА để tiếp tục cài đặt." IDRETRY retry_wait
    Abort
  ${EndIf}
  Sleep 500
  IntOp $1 $1 + 1
  Goto wait_for_app
  retry_wait:
  StrCpy $1 0
  Goto wait_for_app
FunctionEnd
Section "VN ПОЧТА"
  Call CheckRunning
  SetShellVarContext current
  SetOutPath "$INSTDIR"
  File /r "${APP_DIR}\*"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateDirectory "$SMPROGRAMS\VN ПОЧТА"
  CreateShortcut "$SMPROGRAMS\VN ПОЧТА\VN ПОЧТА.lnk" "$INSTDIR\VN-Pochta.exe"
  CreateShortcut "$DESKTOP\VN ПОЧТА.lnk" "$INSTDIR\VN-Pochta.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\VN-Pochta" "DisplayName" "VN ПОЧТА"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\VN-Pochta" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\VN-Pochta" "UninstallString" '$\"$INSTDIR\Uninstall.exe$\"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\VN-Pochta" "DisplayIcon" "$INSTDIR\VN-Pochta.exe"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\VN-Pochta" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\VN-Pochta" "NoRepair" 1
SectionEnd
Section "Uninstall"
  SetShellVarContext current
  Delete "$DESKTOP\VN ПОЧТА.lnk"
  Delete "$SMPROGRAMS\VN ПОЧТА\VN ПОЧТА.lnk"
  RMDir "$SMPROGRAMS\VN ПОЧТА"
  ; User data and encrypted credentials live outside INSTDIR and are preserved.
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\VN-Pochta"
SectionEnd
