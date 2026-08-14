@echo off
cd /d "%~dp0"
echo.
echo  Building and publishing the current version...
call "%~dp0start-all.cmd"
echo.
echo  Enabling the supervisor for continuous operation...
call "%~dp0resume-supervisor.cmd"
echo.
echo  Publication complete. Check with supervisor-status.cmd and status.cmd.
pause
