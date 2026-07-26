@echo off
REM ============================================
REM  NOTIFICATIONS worker (Redis + ARQ)
REM  Double-click to start
REM  Guide: NOTIFICATIONS.md  (also UVEDOMLENIYA.md)
REM ============================================
cd /d "%~dp0"
echo.
echo  Starting notification worker...
echo  Guide: %~dp0NOTIFICATIONS.md
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-notifications.ps1" %*
echo.
echo  Launcher finished. Worker runs in its own window.
pause