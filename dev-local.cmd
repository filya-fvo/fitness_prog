@echo off
cd /d "%~dp0"
echo.
echo  DEVELOPMENT MODE
echo  The supervisor will be paused so it does not replace Vite during development.
echo.
call "%~dp0pause-supervisor.cmd"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-all.ps1" -Development -SkipTunnel -SkipTelegram -Reload
echo.
echo  Dev UI: http://127.0.0.1:5173
echo  API:    http://127.0.0.1:8001/docs
echo  When finished, run publish-local.cmd.
pause
