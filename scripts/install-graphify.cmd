@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-graphify.ps1"
exit /b %ERRORLEVEL%
