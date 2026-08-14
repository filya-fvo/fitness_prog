@echo off
REM ============================================
REM  PRODUCTION PUBLISH: built frontend + API on :8001 + Tailscale Funnel
REM  Double-click this file or run from terminal
REM ============================================
cd /d "%~dp0"
echo.
echo  Building and publishing fitness_prog (single app :8001 + Tailscale Funnel)...
echo  Close the backend PowerShell window to stop the application.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-all.ps1" %*
echo.
echo  Done. Press any key to close this launcher window (services keep running).
pause >nul
