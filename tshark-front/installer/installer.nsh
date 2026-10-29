AllowRootDirInstall true
InstallDir "$LOCALAPPDATA\Programs\${APP_FILENAME}"
!include "FileFunc.nsh"

!macro customPageAfterChangeDir
  !undef MUI_PAGE_CUSTOMFUNCTION_PRE
  !define MUI_PAGE_CUSTOMFUNCTION_PRE normalizeInstallDirectory
  !pragma warning disable 6010

  Function normalizeInstallDirectory
    Push $0
    Push $1
    StrCpy $0 $INSTDIR
    trimTrailingSeparator:
      StrCpy $1 $0 1 -1
      StrCmp $1 "\" 0 checkDirectoryName
      StrCpy $0 $0 -1
      Goto trimTrailingSeparator
    checkDirectoryName:
      ${GetFileName} "$0" $1
      ${If} $1 != "${APP_FILENAME}"
        StrCpy $INSTDIR "$0\${APP_FILENAME}"
      ${Else}
        StrCpy $INSTDIR "$0"
      ${EndIf}
    Pop $1
    Pop $0
  FunctionEnd
!macroend

!include "${__FILEDIR__}\..\build\installer-files.nsh"
