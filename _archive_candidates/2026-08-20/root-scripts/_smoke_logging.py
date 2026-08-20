from __future__ import annotations

import shutil
import sys
import time
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(r"c:\fitness_prog")
sys.path.insert(0, str(ROOT / "backend"))

from app.core.logging import archive_stale_logs, setup_logging  # noqa: E402
from loguru import logger  # noqa: E402

tmp = ROOT / "logs" / "_test_tmp"
if tmp.exists():
    shutil.rmtree(tmp, ignore_errors=True)
tmp.mkdir(parents=True, exist_ok=True)

y = date.today() - timedelta(days=1)
old = tmp / f"api-{y.isoformat()}.log"
old.write_text("old\n", encoding="utf-8")
stats = archive_stale_logs(tmp)
print("archive_stats", stats)
print("old_exists", old.exists())
print("zip", [p.name for p in (tmp / "archive").glob("*.zip")])

setup_logging(environment="development", service="api", log_dir=tmp)
logger.info("smoke_log_line")
time.sleep(0.5)
print("logs", sorted(p.name for p in tmp.glob("*.log")))
print("ok")
