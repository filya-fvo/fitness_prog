@echo off
setlocal
REM Unified content pipeline (P3) — alias of rebuild-content + optional dry-run videos.
REM Usage:
REM   content.cmd
REM   content.cmd --full-download
REM   content.cmd --videos-only
REM   content.cmd --videos-dry-run

cd /d "%~dp0.."

if /I "%~1"=="--videos-only" (
  call "%~dp0apply-videos.cmd"
  exit /b %ERRORLEVEL%
)
if /I "%~1"=="--videos-dry-run" (
  call "%~dp0apply-videos.cmd" --dry-run
  exit /b %ERRORLEVEL%
)

call "%~dp0rebuild-content.cmd" %*
exit /b %ERRORLEVEL%
