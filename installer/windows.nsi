Unicode true
!include "MUI2.nsh"
!include "x64.nsh"
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
  retry:
  FindWindow $0 "Chrome_WidgetWin_1" "VN ПОЧТА"
  ${If} $0 != 0
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Please close VN ПОЧТА before continuing." IDRETRY retry
    Abort
  ${EndIf}
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
