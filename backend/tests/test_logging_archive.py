"""Daily log archive helpers."""

from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path

from app.core.logging import archive_stale_logs, setup_logging


def test_archive_moves_yesterday_log(tmp_path: Path) -> None:
    today = date.today()
    yesterday = today - timedelta(days=1)
    old = tmp_path / f"api-{yesterday.isoformat()}.log"
    cur = tmp_path / f"api-{today.isoformat()}.log"
    old.write_text("old line\n", encoding="utf-8")
    cur.write_text("today line\n", encoding="utf-8")

    stats = archive_stale_logs(tmp_path, keep_archive_days=30)
    assert stats["archived"] == 1
    assert not old.exists()
    assert cur.exists()
    zipped = tmp_path / "archive" / f"api-{yesterday.isoformat()}.log.zip"
    assert zipped.exists()


def test_setup_logging_creates_today_file(tmp_path: Path) -> None:
    setup_logging(environment="development", service="api", log_dir=tmp_path)
    from loguru import logger

    logger.info("hello_file_log")
    # enqueue=True may delay write slightly — force complete by re-setup not needed;
    # file path pattern exists as soon as sink is added after first message with enqueue
    import time

    time.sleep(0.2)
    today = date.today().isoformat()
    matches = list(tmp_path.glob(f"api-{today}.log"))
    assert matches, f"expected api-{today}.log in {list(tmp_path.iterdir())}"
