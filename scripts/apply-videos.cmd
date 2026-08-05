@echo off
setlocal
REM Apply YouTube/video URLs from docs/exercise-media-checklist.csv into DB.
cd /d "%~dp0.."

set "PY="
if exist "backend\.venv\Scripts\python.exe" set "PY=backend\.venv\Scripts\python.exe"
if not defined PY if exist ".venv\Scripts\python.exe" set "PY=.venv\Scripts\python.exe"
if not defined PY (
  echo ERROR: Python venv not found
  exit /b 1
)

echo Applying videos from docs\exercise-media-checklist.csv ...
"%PY%" backend\scripts\apply_video_urls.py --from-checklist %*
exit /b %ERRORLEVEL%
