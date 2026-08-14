@echo off
cd /d "%~dp0"
echo Stopping backend :8001 and frontend :5173 ...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ports=8001,5173; foreach($p in $ports){ Get-NetTCPConnection -LocalPort $p -State Listen -EA SilentlyContinue | Select-Object -Expand OwningProcess -Unique | ForEach-Object { Write-Host ('kill PID '+$_+' port '+$p); Stop-Process -Id $_ -Force -EA SilentlyContinue } }; Write-Host 'Stopped local API/UI. Tailscale Funnel stays configured and will resume with the app.'"
echo.
pause
