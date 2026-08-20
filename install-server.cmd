@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Fitness App - server installation

echo.
echo  ============================================
echo   FITNESS APP - FIRST SERVER INSTALLATION
echo   Project: %CD%
echo  ============================================
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "Start-Process powershell.exe -Verb RunAs -Wait -ArgumentList '-NoProfile -ExecutionPolicy Bypass -NoExit -File ""%~dp0scripts\install-server.ps1""'"

if errorlevel 1 (
  echo.
  echo [ERROR] Installation launcher failed.
  pause
  exit /b 1
)

endlocal
