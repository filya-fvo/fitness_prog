@echo off
REM ============================================
REM  LOCAL PUBLISH: built frontend + API on 127.0.0.1:8001
REM  Double-click this file or run from terminal
REM ============================================
cd /d "%~dp0"
echo.
echo  Building and publishing the local fitness_prog app on :8001...
echo  Close the backend PowerShell window to stop the application.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-all.ps1" %*
echo.
echo  Done. Press any key to close this launcher window (services keep running).
pause >nul
