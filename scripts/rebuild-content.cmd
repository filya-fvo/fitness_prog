@echo off
setlocal
REM Rebuild exercise GIFs/catalog + re-apply video URLs from checklist.
REM Usage:
REM   rebuild-content.cmd
REM   rebuild-content.cmd --full-download   (re-download GIFs, archive old)

cd /d "%~dp0.."

set "PY="
if exist "backend\.venv\Scripts\python.exe" set "PY=backend\.venv\Scripts\python.exe"
if not defined PY if exist ".venv\Scripts\python.exe" set "PY=.venv\Scripts\python.exe"
if not defined PY (
  echo ERROR: Python venv not found
  exit /b 1
)

if /I "%~1"=="--full-download" (
  echo === Full rebuild: archive + download GIFs ===
  "%PY%" backend\scripts\rebuild_catalog_from_dataset.py
) else (
  echo === Rebuild catalog ^(skip archive/download^) ===
  "%PY%" backend\scripts\rebuild_catalog_from_dataset.py --skip-archive --skip-download
)
if errorlevel 1 exit /b %ERRORLEVEL%

echo === Seed programs extras ===
"%PY%" backend\scripts\add_extra_programs.py
if errorlevel 1 exit /b %ERRORLEVEL%

echo === Apply video URLs from checklist ===
"%PY%" backend\scripts\apply_video_urls.py --from-checklist
if errorlevel 1 exit /b %ERRORLEVEL%

echo DONE content pipeline
exit /b 0
