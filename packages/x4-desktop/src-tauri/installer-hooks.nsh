; NSIS installer hooks for X4 Nexus.
;
; The app ships the Python API as a PyInstaller onedir sidecar (x4c-server.exe), whose
; bundled DLLs under server\x4c-server\_internal (e.g. VCRUNTIME140.dll) stay locked
; while the process runs. During an in-app auto-update the updater kills the main
; x4-desktop.exe but NOT the sidecar, so the installer can't overwrite those locked
; DLLs and fails with "Error opening file for writing: ...\_internal\VCRUNTIME140.dll".
;
; Kill the sidecar (and any children) before the install section writes any files.
; On a fresh install with no running instance, taskkill simply no-ops.
!macro NSIS_HOOK_PREINSTALL
  nsExec::Exec 'taskkill /F /T /IM x4c-server.exe'
  Pop $0
!macroend
