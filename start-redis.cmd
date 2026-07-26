@echo off
REM Portable Redis for notifications (no Memurai MSI)
cd /d "%~dp0"
echo.
echo  Starting portable Redis (tools\redis)...
echo  Guide: %~dp0NOTIFICATIONS.md
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-redis.ps1" %*
echo.
pause
