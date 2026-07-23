@echo off
REM Wrapper: bypasses PowerShell execution policy for scripts\dev.ps1
REM Usage: scripts\dev.cmd status | start | restart-backend | help
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev.ps1" %*
exit /b %ERRORLEVEL%
