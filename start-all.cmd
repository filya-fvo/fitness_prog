@echo off
REM ============================================
REM  FULL START: backend + frontend + ngrok
REM  Double-click this file or run from terminal
REM ============================================
cd /d "%~dp0"
echo.
echo  Starting fitness_prog (backend + frontend + ngrok + Telegram Open)...
echo  Close the extra PowerShell windows to stop individual services.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-all.ps1" %*
echo.
echo  Done. Press any key to close this launcher window (services keep running).
pause >nul
