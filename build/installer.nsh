; MMS uninstaller customization — admin-password gate + data safety.
;
; Wired in via package.json -> build.nsis.include. electron-builder inserts
; this file into the generated installer script; the two macros below are
; invoked by its uninstaller template:
;   customUnInit   -> inside un.onInit, BEFORE any file is removed
;   customUnInstall-> end of the uninstall section, AFTER files are removed
;
; Gate design (main process + renderer implement the app side):
;   "$INSTDIR\${APP_EXECUTABLE_FILENAME}" --verify-uninstall
; shows a small MMS window asking for the mahallu administrator password.
; Exit codes: 0 = verified, 1 = declined/wrong password. Any other code
; (app missing/crashed) fails OPEN so a broken install can still be removed.
; Silent uninstalls (updates, reinstall-over) skip the gate entirely.

!macro customUnInit
  ; Skip the gate in silent mode (updates reinstall-over-silently).
  IfSilent mms_gate_passed
  ; Skip if the app executable is gone (nothing left to ask).
  IfFileExists "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0 mms_gate_passed
    DetailPrint "MMS: verifying administrator password before uninstall..."
    ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --verify-uninstall' $0
    StrCmp "$0" "1" 0 mms_gate_passed
      MessageBox MB_OK|MB_ICONSTOP "Uninstall cancelled: the MMS administrator password is required to uninstall this application.$\r$\n$\r$\n(ഈ ആപ്പ് നീക്കം ചെയ്യാൻ MMS അഡ്മിൻ പാസ്‌വേഡ് ആവശ്യമാണ്.)"
      Abort
  mms_gate_passed:
!macroend

!macro customUnInstall
  ; Reassure the user after the uninstall finishes: the mahallu's database
  ; and backups live in %APPDATA%\mms and are NOT touched by the uninstaller.
  IfFileExists "$APPDATA\mms\mms.db" 0 mms_data_note_done
    MessageBox MB_OK|MB_ICONINFORMATION "MMS was uninstalled — your DATA IS SAFE.$\r$\n$\r$\nKept untouched at:$\r$\n$APPDATA\mms$\r$\n(database + backups)$\r$\n$\r$\nPlease do NOT delete that folder.$\r$\n(നിങ്ങളുടെ ഡാറ്റയും ബാക്കപ്പുകളും $APPDATA\mms ഫോൾഡറിൽ സുരക്ഷിതമായി നിലനിർത്തിയിട്ടുണ്ട് — ഈ ഫോൾഡർ ഇല്ലാതാക്കരുത്.)"
  mms_data_note_done:
!macroend
