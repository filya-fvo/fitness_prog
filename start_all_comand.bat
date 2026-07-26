@echo off
set "Folder=C:\fitness_prog"
echo %Folder%

start "" "%Folder%\start-all.cmd"
start "" "%Folder%\start-redis.cmd"
start "" "%Folder%\start-notifications.cmd"