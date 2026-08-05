@echo off
setlocal
REM Wipe user DB + notify Telegram users (after tests / catalog rebuilds).
REM Usage:
REM   reset-user-db.cmd           - dry-run
REM   reset-user-db.cmd --execute - wipe + notify

cd /d "%~dp0"

set "PY="
if exist "backend\.venv\Scripts\python.exe" set "PY=backend\.venv\Scripts\python.exe"
if not defined PY if exist ".venv\Scripts\python.exe" set "PY=.venv\Scripts\python.exe"
if not defined PY (
  echo ERROR: Python venv not found ^(backend\.venv or .venv^)
  exit /b 1
)

set "SCRIPT=backend\scripts\reset_user_data_and_notify.py"
if not exist "%SCRIPT%" (
  echo ERROR: Missing %SCRIPT%
  exit /b 1
)

if /I "%~1"=="--execute" goto EXECUTE
if /I "%~1"=="-Execute" goto EXECUTE
if /I "%~1"=="-execute" goto EXECUTE

echo === DRY-RUN ^(pass --execute to apply^) ===
"%PY%" "%SCRIPT%"
exit /b %ERRORLEVEL%

:EXECUTE
echo === EXECUTE: wipe user DB + notify ===
"%PY%" "%SCRIPT%" --execute
exit /b %ERRORLEVEL%
