@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell.exe -Verb RunAs -WindowStyle Hidden -Wait -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File ""%~dp0scripts\disable-local-fitness-runtime.ps1""'"
if errorlevel 1 exit /b %errorlevel%
echo Local Fitness runtime disabled.

