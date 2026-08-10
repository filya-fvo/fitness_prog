@echo off
cd /d C:\fitness_prog\backend
".\.venv\Scripts\python.exe" ".\scripts\_rename_treadmill.py" > "C:\fitness_prog\scripts\_rename_out.txt" 2>&1
echo EXIT=%ERRORLEVEL% >> "C:\fitness_prog\scripts\_rename_out.txt"
