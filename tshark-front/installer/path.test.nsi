Unicode true
SilentInstall silent
RequestExecutionLevel user
!define APP_FILENAME "EasyTshark"
!include "LogicLib.nsh"
!include "installer.nsh"
!define MUI_PAGE_CUSTOMFUNCTION_PRE unused
!insertmacro customPageAfterChangeDir
Name "EasyTshark install path tests"
OutFile "..\..\.gcc-check\installer-path-test.exe"

!macro assertInstallDirectory input expected
  StrCpy $INSTDIR "${input}"
  Call normalizeInstallDirectory
  ${If} $INSTDIR != "${expected}"
    SetErrorLevel 1
    Quit
  ${EndIf}
!macroend

Function .onInit
  !insertmacro assertInstallDirectory "D:\" "D:\EasyTshark"
  !insertmacro assertInstallDirectory "D:\1\" "D:\1\EasyTshark"
  !insertmacro assertInstallDirectory "D:\1" "D:\1\EasyTshark"
  !insertmacro assertInstallDirectory "D:\EasyTshark" "D:\EasyTshark"
  !insertmacro assertInstallDirectory "D:\EasyTshark\" "D:\EasyTshark"
  !insertmacro assertInstallDirectory "D:\EasyTshark-backup" "D:\EasyTshark-backup\EasyTshark"
  !insertmacro assertInstallDirectory "D:\EasyTshark\1" "D:\EasyTshark\1\EasyTshark"
  !insertmacro assertInstallDirectory "D:\Program Files\1\" "D:\Program Files\1\EasyTshark"
  SetErrorLevel 0
  Quit
FunctionEnd

Section
SectionEnd
