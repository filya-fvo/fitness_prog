@echo off
cd /d "%~dp0..\backend"
.\.venv\Scripts\python.exe -m pytest tests\test_logging_archive.py -q
echo PYTEST_EXIT=%ERRORLEVEL%
.\.venv\Scripts\python.exe -c "from pathlib import Path; from app.core.logging import setup_logging; from loguru import logger; import time; d=Path.cwd().parent/'logs'; setup_logging(environment='development', service='api', log_dir=d); logger.info('smoke_log_line'); time.sleep(0.4); print('files', sorted(p.name for p in d.glob('*.log')))"
echo SMOKE_EXIT=%ERRORLEVEL%
