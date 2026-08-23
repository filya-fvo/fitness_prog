"""Structured logging via loguru (TZ section 12).

Layout (project root):
  logs/
    api-YYYY-MM-DD.log          # one file per day per service
    worker-YYYY-MM-DD.log
    archive/
      api-YYYY-MM-DD.log.zip    # previous days, zipped
"""

from __future__ import annotations

import logging
import re
import sys
import zipfile
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import TextIO

from loguru import logger

# backend/app/core/logging.py -> parents[3] = repo root (fitness_prog)
_REPO_ROOT = Path(__file__).resolve().parents[3]
_DEFAULT_LOG_DIR = _REPO_ROOT / "logs"
_DATE_IN_NAME = re.compile(r"(20\d{2}-\d{2}-\d{2})")
_TELEGRAM_BOT_TOKEN = re.compile(r"(api\.telegram\.org/bot)[^/\s\"']+")
_BEARER_TOKEN = re.compile(r"(?i)(authorization[=:]\s*bearer\s+)[^\s,;\"']+")


class _EncodingSafeStream:
    """Keep console logging alive when the host encoding cannot represent a record."""

    def __init__(self, stream: TextIO) -> None:
        self._stream = stream

    def write(self, message: str) -> None:
        try:
            self._stream.write(message)
        except UnicodeEncodeError:
            encoding = self._stream.encoding or "ascii"
            safe_message = message.encode(encoding, errors="backslashreplace").decode(encoding)
            self._stream.write(safe_message)

    def flush(self) -> None:
        self._stream.flush()

    def isatty(self) -> bool:
        return self._stream.isatty()


def redact_log_secrets(message: str) -> str:
    """Mask credentials that may appear in third-party HTTP client log messages."""
    safe = _TELEGRAM_BOT_TOKEN.sub(r"\1[REDACTED]", str(message))
    return _BEARER_TOKEN.sub(r"\1[REDACTED]", safe)


class InterceptHandler(logging.Handler):
    """Route stdlib logging into loguru."""

    def emit(self, record: logging.LogRecord) -> None:
        try:
            level = logger.level(record.levelname).name
        except ValueError:
            level = record.levelno
        frame, depth = logging.currentframe(), 2
        while frame and frame.f_code.co_filename == logging.__file__:
            frame = frame.f_back
            depth += 1
        logger.opt(depth=depth, exception=record.exc_info).log(
            level,
            redact_log_secrets(record.getMessage()),
        )


def resolve_log_dir(log_dir: str | Path | None = None) -> Path:
    if log_dir is None or str(log_dir).strip() == "":
        return _DEFAULT_LOG_DIR
    return Path(log_dir).expanduser().resolve()


def _date_from_log_name(path: Path) -> date | None:
    m = _DATE_IN_NAME.search(path.name)
    if not m:
        return None
    try:
        return date.fromisoformat(m.group(1))
    except ValueError:
        return None


def archive_stale_logs(
    log_dir: Path,
    *,
    archive_subdir: str = "archive",
    keep_archive_days: int = 30,
) -> dict[str, int]:
    """
    Move yesterday-and-older ``*.log`` from log_dir into log_dir/archive as .zip.
    Deletes archive zips older than keep_archive_days.
    Never touches today's active log file.
    """
    log_dir = Path(log_dir)
    log_dir.mkdir(parents=True, exist_ok=True)
    archive_dir = log_dir / archive_subdir
    archive_dir.mkdir(parents=True, exist_ok=True)

    today = date.today()
    archived = 0
    removed_old = 0

    for path in sorted(log_dir.glob("*.log")):
        if not path.is_file():
            continue
        file_day = _date_from_log_name(path)
        if file_day is None:
            try:
                mtime_day = datetime.fromtimestamp(path.stat().st_mtime).date()
            except OSError:
                continue
            if mtime_day >= today:
                continue
            file_day = mtime_day
        if file_day >= today:
            continue

        zip_path = archive_dir / f"{path.stem}.log.zip"
        try:
            if not zip_path.exists():
                with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
                    zf.write(path, arcname=path.name)
            path.unlink(missing_ok=True)
            archived += 1
        except OSError:
            continue

    cutoff = today - timedelta(days=max(1, keep_archive_days))
    for zpath in archive_dir.glob("*.zip"):
        zday = _date_from_log_name(zpath)
        if zday is None:
            try:
                zday = datetime.fromtimestamp(zpath.stat().st_mtime).date()
            except OSError:
                continue
        if zday < cutoff:
            try:
                zpath.unlink(missing_ok=True)
                removed_old += 1
            except OSError:
                continue

    return {"archived": archived, "removed_old_archives": removed_old}


def setup_logging(
    *,
    environment: str = "development",
    service: str = "api",
    log_dir: str | Path | None = None,
    keep_archive_days: int = 30,
    file_level: str = "INFO",
) -> Path:
    """
    Configure loguru: stdout + daily file sink + archive of previous days.

    - One file per calendar day per service: ``{service}-YYYY-MM-DD.log``
    - At setup, older ``*.log`` are zipped into ``logs/archive/``
    """
    logger.remove()

    serialize = environment != "development"
    console_fmt = (
        "{time:YYYY-MM-DD HH:mm:ss.SSS} | {level:<8} | {name}:{function}:{line} | {message}"
        if environment == "development"
        else "{message}"
    )
    logger.add(
        _EncodingSafeStream(sys.stdout),
        level="INFO",
        serialize=serialize,
        backtrace=environment == "development",
        diagnose=environment == "development",
        enqueue=False,
        format=console_fmt,
    )

    base = resolve_log_dir(log_dir)
    base.mkdir(parents=True, exist_ok=True)
    (base / "archive").mkdir(parents=True, exist_ok=True)

    stats = archive_stale_logs(base, keep_archive_days=keep_archive_days)

    safe_service = re.sub(r"[^a-zA-Z0-9_-]+", "_", (service or "app").strip()) or "app"
    # Daily file: new path each day via {time:YYYY-MM-DD}; rotate at midnight
    file_path = base / f"{safe_service}-{{time:YYYY-MM-DD}}.log"
    file_fmt = (
        "{time:YYYY-MM-DD HH:mm:ss.SSS} | {level:<8} | {extra[service]} | "
        "{name}:{function}:{line} | {message}"
    )
    archive_dir = base / "archive"

    def _compress_rotated_to_archive(rotated_path: str) -> None:
        """loguru compression hook: zip rotated day file into logs/archive/."""
        src = Path(rotated_path)
        if not src.is_file():
            return
        archive_dir.mkdir(parents=True, exist_ok=True)
        dest = archive_dir / f"{src.name}.zip"
        try:
            if not dest.exists():
                with zipfile.ZipFile(dest, "w", compression=zipfile.ZIP_DEFLATED) as zf:
                    zf.write(src, arcname=src.name)
            src.unlink(missing_ok=True)
        except OSError:
            return
        # prune very old archives
        try:
            archive_stale_logs(base, keep_archive_days=keep_archive_days)
        except OSError:
            return

    logger.configure(extra={"service": safe_service})

    logger.add(
        str(file_path),
        level=file_level,
        encoding="utf-8",
        rotation="00:00",
        retention=None,
        compression=_compress_rotated_to_archive,
        enqueue=True,
        backtrace=True,
        diagnose=environment == "development",
        serialize=False,
        format=file_fmt,
    )

    logging.root.handlers = [InterceptHandler()]
    logging.root.setLevel(logging.INFO)
    for name in (
        "uvicorn",
        "uvicorn.error",
        "uvicorn.access",
        "fastapi",
        "arq",
        "httpx",
        "sqlalchemy.engine",
    ):
        logging.getLogger(name).handlers = [InterceptHandler()]
        logging.getLogger(name).propagate = False

    logger.info(
        "logging_ready service={} dir={} archived={} removed_old_archives={}",
        safe_service,
        str(base),
        stats.get("archived", 0),
        stats.get("removed_old_archives", 0),
    )
    return base
