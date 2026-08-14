@echo off
setlocal EnableExtensions
cd /d "C:\fitness_prog"
set "Folder=C:\fitness_prog"
title fitness_prog launcher
echo.
echo  ============================================
echo   fitness_prog full start
echo   %Folder%
echo  ============================================
echo.

REM --- Preflight: backend must import (catches SyntaxError before windows open) ---
set "PY=%Folder%\backend\.venv\Scripts\python.exe"
if not exist "%PY%" (
  echo [ERROR] Backend venv not found:
  echo   %PY%
  echo Run once: cd backend ^& python -m venv .venv ^& .venv\Scripts\pip install -e ".[dev]"
  pause
  exit /b 1
)

echo [preflight] Checking backend import...
pushd "%Folder%\backend"
"%PY%" -c "import app.main"
set "IMPERR=%ERRORLEVEL%"
popd
if not "%IMPERR%"=="0" (
  echo.
  echo [ERROR] Backend does not start: import app.main failed.
  echo Fix the Python error shown above, then run this bat again.
  pause
  exit /b 1
)
echo [preflight] Backend import OK
echo.

REM Order: Redis -> notifications worker -> app (backend/frontend/Tailscale Funnel)
echo [1/3] Redis...
start "fitness Redis" cmd /k "cd /d %Folder% && call start-redis.cmd"

timeout /t 2 /nobreak >nul

echo [2/3] Notification worker...
start "fitness Notifications" cmd /k "cd /d %Folder% && call start-notifications.cmd"

timeout /t 1 /nobreak >nul

echo [3/3] Backend + Frontend + Tailscale Funnel...
start "fitness App" cmd /k "cd /d %Folder% && call start-all.cmd"

echo.
echo  Launched:
echo    - Redis
echo    - Notification worker
echo    - Backend :8001 + Frontend :5173 + Tailscale Funnel
echo.
echo  Backend docs: http://127.0.0.1:8001/docs
echo  Frontend:     http://127.0.0.1:5173
echo.
echo  Close this window anytime; services keep running in their windows.
pause
endlocal
